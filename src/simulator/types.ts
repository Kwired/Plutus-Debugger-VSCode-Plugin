export interface SimulationContext {
    plutusFile: string;
    protocolFile: string;
    socketPath: string;
    senderAddress: string;
    testnetMagic: number;
    redeemerJson: string;
    datumJson: string;
    assetName: string;
}

export interface UTxO {
    txHash: string;
    index: number;
    lovelace: bigint;
}
