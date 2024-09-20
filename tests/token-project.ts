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
import { getPoolMarketCap } from "../getPoolMarketCap";
import BN from "bn.js";
import assert from "assert";

describe("token_lock", () => {
  // Set up the provider and the program interface
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const idl = JSON.parse(fs.readFileSync("./target/idl/token_lock.json", "utf8"));
  const programId = new PublicKey("FRfRQnN3bouip1RV8Th6fmNzTomUv7ewXkUW4BWQagwr");
  const program = new Program(idl, programId, provider);

  const globalState = anchor.web3.Keypair.generate();
  const user = anchor.web3.Keypair.generate();

  let mint = null;
  let userTokenAccount = null;
  let vaultTokenAccount = null;
  let vaultAuthorityPda = null;
  let vaultAuthorityBump = null;

  before(async () => {
    // Airdrop some SOL to the user
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(user.publicKey, anchor.web3.LAMPORTS_PER_SOL)
    );

    // Create a new SPL token mint
    mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      null,
      9
    );

    // Create associated token accounts for the user and the vault
    userTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      user.publicKey
    );

    vaultTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      provider.wallet.publicKey
    );

    [vaultAuthorityPda, vaultAuthorityBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("vault-authority")],
      program.programId
    );

    await mintTo(
      provider.connection,
      provider.wallet.payer,
      mint,
      userTokenAccount.address,
      provider.wallet.publicKey,
      1000 * 10 ** 9
    );
  });

  it("should initialize the contract", async () => {
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

    console.log("Initialized Contract Tx:", tx);

    const state = await program.account.globalState.fetch(globalState.publicKey);
    assert.equal(state.currentCap.toNumber(), initialMarketCap.toNumber(), "Market cap should match");
    assert.equal(state.quantum.toNumber(), quantum.toNumber(), "Quantum should match");
  });

  it("should lock tokens for the user", async () => {
    const maxLockableAmount = new anchor.BN(300 * 10 ** 9); // 30% of 1000 tokens
    const [userAccountPda] = await PublicKey.findProgramAddress(
          [Buffer.from("user-account"), user.publicKey.toBuffer()],
          program.programId
    );

    const txLock = await program.methods
      .lockTokens(maxLockableAmount)
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

    const userTokenBalance = await provider.connection.getTokenAccountBalance(userTokenAccount.address);
    assert.equal(userTokenBalance.value.uiAmount, 700, "User should have 700 tokens left");
  });

  it("should burn the locked tokens after 2 minutes", async () => {
    // Wait for 2 minutes
    await new Promise((resolve) => setTimeout(resolve, 120000));


    await setAuthority(
          provider.connection,
          provider.wallet.payer,
          vaultTokenAccount.address,   
          provider.wallet.publicKey,    
          AuthorityType.AccountOwner,   
          vaultAuthorityPda             
    );
    const txBurn = await program.methods
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

    console.log("Burned Tokens with Tx:", txBurn);

    const vaultTokenBalance = await provider.connection.getTokenAccountBalance(vaultTokenAccount.address);
    assert.equal(vaultTokenBalance.value.uiAmount, 0, "All locked tokens should be burned");
  });

  it("should update the market cap", async () => {
    const newMarketCap = new anchor.BN(20000000);

    const txUpdateCap = await program.methods
      .updateCap(newMarketCap)
      .accounts({
        admin: provider.wallet.publicKey,
        globalState: globalState.publicKey,
      })
      .rpc();

    console.log("Update Cap Tx:", txUpdateCap);

    const state = await program.account.globalState.fetch(globalState.publicKey);
    assert.equal(state.currentCap.toNumber(), newMarketCap.toNumber(), "Market cap should be updated");
  });
});
