// admin: initialize YieldConfig PDA on devnet (performance fee: 500 bps = 5%)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rpc = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const keypairPath = resolve(__dirname, '..', '..', 'deploy-keypair.json');
const idlPath = resolve(__dirname, '..', 'src', 'idl.json');

const secret = JSON.parse(readFileSync(keypairPath, 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(secret));
const idl = JSON.parse(readFileSync(idlPath, 'utf8'));

const conn = new Connection(rpc, 'confirmed');
const wallet = new anchor.Wallet(authority);
const provider = new anchor.AnchorProvider(conn, wallet, { commitment: 'confirmed' });
const program = new anchor.Program(idl, provider);

const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('yield_config')], program.programId);

const existing = await conn.getAccountInfo(configPda);
if (existing) {
  console.log('already initialized:', configPda.toBase58());
  process.exit(0);
}

const FEE_BPS = 500;
const sig = await program.methods
  .initializeConfig(FEE_BPS)
  .accounts({ authority: authority.publicKey })
  .rpc();

console.log('config PDA:', configPda.toBase58());
console.log('authority  :', authority.publicKey.toBase58());
console.log('fee bps    :', FEE_BPS);
console.log('tx         :', sig);
