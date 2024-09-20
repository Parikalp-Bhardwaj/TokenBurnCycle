import * as anchor from "@project-serum/anchor";
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  createMint,
  mintTo,
  transfer,
  setAuthority,
  AuthorityType,
} from "@solana/spl-token";
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "fs";
import { Program } from "@project-serum/anchor";
import { getPoolMarketCap } from "./getPoolMarketCap"
import BN from 'bn.js'

async function main() {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.AnchorProvider.env();

  const idl = JSON.parse(fs.readFileSync("./target/idl/token_lock.json", "utf8"));
  const programId = new PublicKey("GbwQKqr9T1vqJFctV5x6pQiGym61VfzyQ3Smsa42A59J"); 
  const program = new Program(idl, programId, provider);

  const globalState = Keypair.generate();
  const initialMarketCap = new anchor.BN(10000000); 
  const quantum = new anchor.BN(1000000); 

  const tx = await program.methods
    .initialize(initialMarketCap, quantum)
    .accounts({
      globalState: globalState.publicKey,
      admin: provider.wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([globalState])
    .rpc();
  console.log("Initialized Contract with Tx:", tx);

  // Create a new mint
  const mint = await createMint(
    provider.connection,
    provider.wallet.payer,
    provider.wallet.publicKey, 
    null,
    9  
  );
  console.log("Mint Address ", mint.toBase58());

  const [vaultAuthorityPda, vaultAuthorityBump] = await PublicKey.findProgramAddress(
    [Buffer.from("vault-authority")],
    program.programId
  );
  console.log("vaultAuthorityPda ", vaultAuthorityPda.toBase58());
  console.log("vaultAuthorityBump ", vaultAuthorityBump);

 
  const vaultTokenAccount = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    provider.wallet.payer,         
    mint,
    provider.wallet.publicKey      
  );
  console.log("vaultTokenAccount Address ", vaultTokenAccount.address.toBase58());

  const user = Keypair.generate();
  console.log("User ", user.publicKey.toBase58());

  await provider.connection.confirmTransaction(
    await provider.connection.requestAirdrop(user.publicKey, LAMPORTS_PER_SOL)
  );
  console.log("Airdropped 1 SOL to the user's account");

  const userTokenAccount = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    provider.wallet.payer,  
    mint,
    user.publicKey        
  );
  console.log("userTokenAccount ", userTokenAccount.address.toBase58());


  const adminTokenAccount = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    provider.wallet.payer,         
    mint,
    provider.wallet.publicKey     
  );
  console.log("adminTokenAccount ", adminTokenAccount.address.toBase58());

 
  await mintTo(
    provider.connection,
    provider.wallet.payer,
    mint,
    adminTokenAccount.address,
    provider.wallet.publicKey,
    1000 * 10 ** 9
  );

  
  await mintTo(
    provider.connection,
    provider.wallet.payer,
    mint,
    userTokenAccount.address,
    provider.wallet.publicKey,
    1000 * 10 ** 9
  );

  
  const userTokenBalance = await provider.connection.getTokenAccountBalance(userTokenAccount.address);
  const adminTokenBalance = await provider.connection.getTokenAccountBalance(adminTokenAccount.address);
  console.log(`User Token Account Balance Before Transfer: ${userTokenBalance.value.uiAmount}`);
  console.log(`Admin Token Account Balance Before Transfer: ${adminTokenBalance.value.uiAmount}`);

  await transfer(
    provider.connection,
    provider.wallet.payer,
    adminTokenAccount.address,
    userTokenAccount.address,
    provider.wallet.publicKey,
    500 * 10 ** 9
  );

 
  const POOL_ID = "8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj";


  const newMarketCap = await getPoolMarketCap(POOL_ID);

  const scaledMarketCap = newMarketCap.div(new BN(1e6)); 
  console.log("Scaled Market Cap:", scaledMarketCap.toString());

  const updateMarketCapTx = await program.methods
    .updateCap(scaledMarketCap)
    .accounts({
      admin: provider.wallet.publicKey,
      globalState: globalState.publicKey,
    })
    .rpc();
  
  console.log("Updated Market Cap with LP Data:", newMarketCap.toString(), updateMarketCapTx);


  const [userAccountPda] = await PublicKey.findProgramAddress(
    [Buffer.from("user-account"), user.publicKey.toBuffer()],
    program.programId
  );

  const userTokenAccountInfo = await provider.connection.getTokenAccountBalance(userTokenAccount.address);
  const userTokenBalance2 = new anchor.BN(userTokenAccountInfo.value.amount);
  console.log("User Token Account Balance:", userTokenBalance2.toString());

 
  const maxLockableAmount = userTokenBalance2.mul(new anchor.BN(30)).div(new anchor.BN(100));
  console.log("Max Lockable Amount:", maxLockableAmount.toString());

 
  const amountToLock = maxLockableAmount; 
  console.log("Lock amount ", amountToLock.toString());

  const txLock = await program.methods
    .lockTokens(amountToLock)
    .accounts({
      user: user.publicKey,
      userAccount: userAccountPda,
      userTokenAccount: userTokenAccount.address,
      vaultTokenAccount: vaultTokenAccount.address,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      globalState: globalState.publicKey,
    })
    .signers([user]) 
    .rpc();
  console.log("Locked Tokens with Tx:", txLock);
  console.log(`https://explorer.solana.com/tx/${txLock}?cluster=custom`);

  await setAuthority(
    provider.connection,
    provider.wallet.payer,
    vaultTokenAccount.address,   
    provider.wallet.publicKey,    
    AuthorityType.AccountOwner,   
    vaultAuthorityPda             
  );
  console.log("PDA set as the authority for the vault token account");

  setTimeout(async () => {
    const burnTokensTx = await program.methods
      .burnTokens(vaultAuthorityBump)
      .accounts({
        admin: provider.wallet.publicKey,
        vaultTokenAccount: vaultTokenAccount.address,
        tokenMint: mint,
        vaultAuthority: vaultAuthorityPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        globalState: globalState.publicKey,
      })
      .rpc();
    
    console.log("Tokens burned:", burnTokensTx);
  }, 120000);
}

main().catch((err) => {
  console.error(err);
});
