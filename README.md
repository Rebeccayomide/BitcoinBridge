# BitcoinBridge

A trustless asset bridge that enables seamless transfer of Bitcoin-backed tokens between Stacks and other blockchain networks.

## Overview

BitcoinBridge is a Clarity smart contract that facilitates cross-chain transfers of Bitcoin-backed assets. Users can lock STX tokens on Stacks and receive corresponding tokens on supported networks (Ethereum, Polygon, Arbitrum), or vice versa.

## Features

- **Trustless Transfers**: Cryptographically secured cross-chain asset transfers
- **Multi-Network Support**: Ethereum, Polygon, and Arbitrum integration
- **Security Features**: Minimum confirmation requirements and transfer limits
- **Admin Controls**: Emergency pause functionality and network management
- **Fee Structure**: Minimal bridge fees to cover operational costs

## Key Functions

### Public Functions

- `initiate-bridge-transfer`: Lock STX and initiate transfer to target network
- `complete-incoming-transfer`: Process incoming transfers from Bitcoin
- `mark-transfer-processed`: Admin function to mark outgoing transfers as complete
- `toggle-bridge-pause`: Emergency pause/unpause functionality
- `update-network-support`: Add or remove supported networks

### Read-Only Functions

- `get-transfer-details`: Retrieve transfer information by ID
- `get-user-balance`: Check user's locked token balance
- `get-bridge-stats`: View overall bridge statistics
- `is-network-supported`: Check if a network is supported

## Constants

- **MIN-CONFIRMATIONS**: 6 (Bitcoin confirmations required)
- **BRIDGE-FEE**: 1,000 µSTX (0.001 STX)
- **MAX-TRANSFER-AMOUNT**: 100,000,000 satoshis (1 BTC)

## Security Considerations

- All transfers require minimum confirmation thresholds
- Emergency pause mechanism for security incidents
- Admin-only functions for sensitive operations
- Transfer amount limits to prevent large-scale attacks

## Usage Example

```clarity
;; Initiate a bridge transfer to Ethereum
(contract-call? .bitcoin-bridge initiate-bridge-transfer
    u50000000  ;; 0.5 BTC in satoshis
    0x742d35cc6e4b62fd4b... ;; Ethereum recipient address
    "ethereum")

;; Check transfer status
(contract-call? .bitcoin-bridge get-transfer-details u1)
```

## Development

This contract is designed for the Stacks blockchain and requires the Clarity runtime for execution.

## License

MIT License
