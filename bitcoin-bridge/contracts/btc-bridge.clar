;; BitcoinBridge - Trustless Bitcoin Asset Bridge

;; Contract constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant MIN-CONFIRMATIONS u6)
(define-constant BRIDGE-FEE u1000) ;; 0.001 STX
(define-constant MAX-TRANSFER-AMOUNT u100000000) ;; 1 BTC in satoshis

;; Error constants
(define-constant ERR-UNAUTHORIZED (err u100))
(define-constant ERR-INVALID-AMOUNT (err u101))
(define-constant ERR-TRANSFER-NOT-FOUND (err u102))
(define-constant ERR-ALREADY-PROCESSED (err u103))
(define-constant ERR-INSUFFICIENT-CONFIRMATIONS (err u104))
(define-constant ERR-INVALID-NETWORK (err u105))
(define-constant ERR-BRIDGE-PAUSED (err u106))
(define-constant ERR-INSUFFICIENT-BALANCE (err u107))

;; Data variables
(define-data-var bridge-paused bool false)
(define-data-var total-locked uint u0)
(define-data-var transfer-nonce uint u0)

;; Data maps for tracking transfers
(define-map pending-transfers
    { transfer-id: uint }
    {
        sender: principal,
        recipient: (buff 34),
        amount: uint,
        target-network: (string-ascii 20),
        block-height: uint,
        processed: bool,
    }
)

(define-map completed-transfers
    { btc-tx-hash: (buff 32) }
    {
        transfer-id: uint,
        amount: uint,
        recipient: principal,
        block-height: uint,
    }
)

;; Network validation map
(define-map supported-networks
    { network: (string-ascii 20) }
    { active: bool }
)

;; User balance tracking
(define-map user-balances
    { user: principal }
    { locked-amount: uint }
)
