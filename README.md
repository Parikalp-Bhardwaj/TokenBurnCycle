# Locking Mechanism

## Overview
The token locking mechanism allows users to lock a portion of their tokens based on the current market cap. Each user can lock up to 30% of their total tokens, but they are restricted to locking their tokens once per "quantum cap slab." A quantum cap slab is defined as a specific market cap threshold that must be crossed before additional locking is permitted.

## Key Points:
- **Maximum Locking Percentage**: Users can lock up to 30% of their total tokens.

- **Locking Restriction**: Users can only lock their tokens once between each quantum cap slab. Once the market cap passes the next threshold, users can lock more tokens.

- **Quantum Cap Slab**: Represents a market cap milestone that allows users to lock tokens. Users can lock more tokens only after the market cap surpasses the next slab.

# Token Locking and Burning Simulation

## Initialization Setup

### 1. Initialization

```javascript
initialize(initialMarketCap, quantum)
initialMarketCap: 10,000,000 units (starting market cap)
quantum: 1,000,000 units (increment for next burn cap)
```

### 2. Global State After Initialization

```bash
current_cap: 10,000,000 units
next_burn_cap: 11,000,000 units (current_cap + quantum)
quantum: 1,000,000 units
```

## Token Minting and Transfer
### 3. Token Minting
```bash
Admin mints 1,000 tokens to their own token account.
Admin mints another 1,000 tokens to the user's token account.
```

### 4. Initial Token Balances

```bash
adminTokenAccount: 1,000 tokens
userTokenAccount: 1,000 tokens

```

### 5. Token Transfer
- Admin transfers 500 tokens from their account to the user's token account.

### 6. Token Balances After Transfer

```bash
adminTokenAccount: 500 tokens
userTokenAccount: 1,500 tokens
```

### Token Locking
### 7. Calculate Lockable Amount
- User can lock up to 30% of their token balance.
- Maximum Lockable Amount: 30% of 1,500 tokens = 450 tokens.

### 8. Lock Tokens
- User locks 450 tokens, transferring them from userTokenAccount to - vaultTokenAccount.
### 9. Token Balances After Locking

```bash
adminTokenAccount: 500 tokens
userTokenAccount: 1,050 tokens (1,500 - 450)
vaultTokenAccount: 450 tokens (locked)
```

### Market Cap Update
### 10. Market Cap Update
- Simulate token value growth by updating the market cap.
- New Market Cap: current_cap + quantum = 10,000,000 + 1,000,000 = 11,000,000 units.
### 11. Global State After Market Cap Update

```bash
current_cap: 11,000,000 units
next_burn_cap: 12,000,000 units (incremented by quantum)
```

### Authority Change and Burning
### 12. Change Authority
- PDA (vaultAuthorityPda) is set as the authority for the vaultTokenAccount.
- This enables PDA to later burn the tokens in the vault.

### 13. Authority Set
```bash
vaultTokenAccount authority: vaultAuthorityPda
```

### 14. Burn Tokens (After 2 Minutes)
- After a 2-minute delay, the 450 tokens in the vaultTokenAccount are burned.

### 15. Final Token Balances After Burning
```bash
adminTokenAccount: 500 tokens
userTokenAccount: 1,050 tokens
vaultTokenAccount: 0 tokens (450 tokens were burned)
```

## Summary of the Simulation
- Initialization:

```bash
current_cap: 10,000,000 units
next_burn_cap: 11,000,000 units
quantum: 1,000,000 units
```

- Minting:

  - Admin and User each receive 1,000 tokens.
- Transfer:

  - Admin transfers 500 tokens to User.

```bash
adminTokenAccount: 500 tokens
userTokenAccount: 1,500 tokens
```

- Locking:
  - User locks 450 tokens in the vault.

```bash
adminTokenAccount: 500 tokens
userTokenAccount: 1,050 tokens
vaultTokenAccount: 450 tokens
```

- Market Cap Update:
  - New current_cap: 11,000,000 units.
  - New next_burn_cap: 12,000,000 units.
- Burning (After 2 Minutes):
  - The 450 tokens in the vault are burned.

```bash
adminTokenAccount: 500 tokens
userTokenAccount: 1,050 tokens
vaultTokenAccount: 0 tokens
```
