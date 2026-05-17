import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface WalletKeys {
    vkeyPath: string;
    skeyPath: string;
    address: string;
    exists?: boolean;
}

export async function generateWallet(name: string, storageDir: string, testnetMagic: number): Promise<WalletKeys> {
    const vkeyPath = path.join(storageDir, `${name}.vkey`);
    const skeyPath = path.join(storageDir, `${name}.skey`);
    const addrPath = path.join(storageDir, `${name}.addr`);

    // 0. Check if exists
    if (fs.existsSync(vkeyPath) && fs.existsSync(skeyPath) && fs.existsSync(addrPath)) {
        const address = fs.readFileSync(addrPath, 'utf8').trim();
        return { vkeyPath, skeyPath, address, exists: true };
    }

    // 1. Generate Keys
    await execFileAsync('cardano-cli', [
        'address', 'key-gen',
        '--verification-key-file', vkeyPath,
        '--signing-key-file', skeyPath
    ]);

    // 2. Build Address
    const { stdout: address } = await execFileAsync('cardano-cli', [
        'address', 'build',
        '--payment-verification-key-file', vkeyPath,
        '--testnet-magic', String(testnetMagic),
        '--out-file', addrPath
    ]);

    return {
        vkeyPath,
        skeyPath,
        address: address.trim(),
        exists: false
    };
}

export async function signTransaction(
    txBodyFile: string,
    skeyPath: string,
    outputFile: string,
    testnetMagic: number
): Promise<string> {
    await execFileAsync('cardano-cli', [
        'conway', 'transaction', 'sign',
        '--tx-body-file', txBodyFile,
        '--signing-key-file', skeyPath,
        '--testnet-magic', String(testnetMagic),
        '--out-file', outputFile
    ]);

    return outputFile;
}

export async function buildTransaction(
    socketPath: string,
    testnetMagic: number,
    txIn: string,
    txOut: string,
    changeAddress: string,
    outputFile: string,
    metadataFile?: string
): Promise<string> {
    const args = [
        'conway', 'transaction', 'build',
        '--testnet-magic', String(testnetMagic),
        '--tx-in', txIn,
        '--tx-out', txOut,
        '--change-address', changeAddress,
        '--out-file', outputFile
    ];

    if (metadataFile) {
        args.push('--metadata-json-file', metadataFile);
    }

    await execFileAsync('cardano-cli', args, {
        env: { ...process.env, CARDANO_NODE_SOCKET_PATH: socketPath }
    });

    return outputFile;
}

export async function submitTransaction(
    txFile: string,
    socketPath: string,
    testnetMagic: number
): Promise<string> {
    const { stdout } = await execFileAsync('cardano-cli', [
        'conway', 'transaction', 'submit',
        '--tx-file', txFile,
        '--testnet-magic', String(testnetMagic)
    ], {
        env: { ...process.env, CARDANO_NODE_SOCKET_PATH: socketPath }
    });

    return stdout.trim() || "Transaction submitted successfully";
}

export function listWallets(keysDir: string): string[] {
    if (!fs.existsSync(keysDir)) return [];
    const files = fs.readdirSync(keysDir);
    const wallets = new Set<string>();
    files.forEach(f => {
        if (f.endsWith('.vkey') || f.endsWith('.skey') || f.endsWith('.addr')) {
            wallets.add(path.basename(f, path.extname(f)));
        }
    });
    return Array.from(wallets).sort();
}

export async function getUtxos(
    address: string,
    socketPath: string,
    testnetMagic: number
): Promise<any> {
    // We use a temporary file to get JSON output which is easier to parse
    const tmpFile = `/tmp/utxo_${Date.now()}.json`;

    try {
        await execFileAsync('cardano-cli', [
            'query', 'utxo',
            '--address', address,
            '--testnet-magic', String(testnetMagic),
            '--out-file', tmpFile
        ], {
            env: { ...process.env, CARDANO_NODE_SOCKET_PATH: socketPath }
        });

        if (fs.existsSync(tmpFile)) {
            const content = fs.readFileSync(tmpFile, 'utf8');
            fs.unlinkSync(tmpFile);
            return JSON.parse(content);
        }
    } catch (e) {
        console.error("Failed to query UTxOs", e);
    }
    return {};
}
