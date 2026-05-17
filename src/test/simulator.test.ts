
import { simulatePlutus } from "../simulator/simulator";
import { execFile } from "child_process";
import * as utxoModule from "../simulator/utxo";
import * as policyModule from "../simulator/policy";

jest.mock("child_process");
jest.mock("../simulator/utxo");
jest.mock("../simulator/policy");

describe("Simulator", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should orchestrate the simulation steps and return cost data", async () => {
        const mockExecFile = execFile as unknown as jest.Mock;

        mockExecFile.mockImplementation((file, args, options, callback) => {
            if (args.includes("calculate-plutus-script-cost")) {
                // Return realistic execution units
                callback(null, {
                    stdout: JSON.stringify([{
                        executionUnits: { memory: 1200000, steps: 450000000 }
                    }]),
                    stderr: ""
                });
            } else {
                callback(null, { stdout: "", stderr: "" });
            }
        });

        (utxoModule.queryUtxos as jest.Mock).mockResolvedValue([]);
        (utxoModule.selectBestUtxo as jest.Mock).mockReturnValue({ txHash: "tx1", index: 0, lovelace: BigInt(1000) });
        (policyModule.derivePolicyId as jest.Mock).mockResolvedValue("policy123");

        const ctx = {
            plutusFile: "/path/script.plutus",
            protocolFile: "/path/protocol.json",
            socketPath: "/tmp/node.socket",
            senderAddress: "addr_test1",
            redeemerJson: "{}",
            datumJson: "{}",
            testnetMagic: 1,
            assetName: "TOKEN"
        };

        const resultJson = await simulatePlutus(ctx);
        const result = JSON.parse(resultJson);

        // Check that the result includes execution cost data
        expect(result.result).toBeDefined();
        expect(result.result[0].executionUnits.memory).toBe(1200000);
        expect(result.timingMs).toBeDefined();

        // topOperations should be derived dynamically, not hardcoded
        expect(result.topOperations).toHaveLength(3);
        expect(result.topOperations[0]).toHaveProperty("name");
        expect(result.topOperations[0]).toHaveProperty("cpuPct");
        expect(result.topOperations[0]).toHaveProperty("memPct");

        // Verify the simulation steps were called
        expect(utxoModule.queryUtxos).toHaveBeenCalled();
        expect(policyModule.derivePolicyId).toHaveBeenCalled();

        expect(mockExecFile).toHaveBeenCalledWith(
            "cardano-cli",
            expect.arrayContaining([
                "transaction", "build-raw",
                "--mint-script-file", "/path/script.plutus"
            ]),
            expect.anything(),
            expect.anything()
        );

        expect(mockExecFile).toHaveBeenCalledWith(
            "cardano-cli",
            expect.arrayContaining([
                "transaction", "calculate-plutus-script-cost"
            ]),
            expect.anything(),
            expect.anything()
        );
    });
});
