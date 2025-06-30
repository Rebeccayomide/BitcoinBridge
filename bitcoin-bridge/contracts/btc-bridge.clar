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

;; Initialize supported networks
(map-set supported-networks { network: "ethereum" } { active: true })
(map-set supported-networks { network: "polygon" } { active: true })
(map-set supported-networks { network: "arbitrum" } { active: true })

;; Helper functions
(define-private (is-valid-network (network (string-ascii 20)))
    (default-to false
        (get active (map-get? supported-networks { network: network }))
    )
)

(define-private (increment-nonce)
    (let ((current-nonce (var-get transfer-nonce)))
        (var-set transfer-nonce (+ current-nonce u1))
        current-nonce
    )
)

;; Public function: Lock STX and initiate bridge transfer
(define-public (initiate-bridge-transfer
        (amount uint)
        (recipient (buff 34))
        (target-network (string-ascii 20))
    )
    (let (
            (transfer-id (increment-nonce))
            (current-balance (default-to u0
                (get locked-amount (map-get? user-balances { user: tx-sender }))
            ))
        )
        ;; Validations
        (asserts! (not (var-get bridge-paused)) ERR-BRIDGE-PAUSED)
        (asserts! (and (> amount u0) (<= amount MAX-TRANSFER-AMOUNT))
            ERR-INVALID-AMOUNT
        )
        (asserts! (is-valid-network target-network) ERR-INVALID-NETWORK)
        (asserts! (>= (stx-get-balance tx-sender) (+ amount BRIDGE-FEE))
            ERR-INSUFFICIENT-BALANCE
        )
        ;; Transfer STX to contract and pay fee
        (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
        (try! (stx-transfer? BRIDGE-FEE tx-sender CONTRACT-OWNER))
        ;; Update state
        (var-set total-locked (+ (var-get total-locked) amount))
        (map-set user-balances { user: tx-sender } { locked-amount: (+ current-balance amount) })
        (map-set pending-transfers { transfer-id: transfer-id } {
            sender: tx-sender,
            recipient: recipient,
            amount: amount,
            target-network: target-network,
            block-height: stacks-block-height,
            processed: false,
        })
        (print {
            event: "bridge-transfer-initiated",
            transfer-id: transfer-id,
            amount: amount,
            target-network: target-network,
        })
        (ok transfer-id)
    )
)

;; Public function: Complete incoming transfer from Bitcoin
(define-public (complete-incoming-transfer
        (btc-tx-hash (buff 32))
        (amount uint)
        (recipient principal)
        (confirmations uint)
    )
    (begin
        ;; Validations
        (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
        (asserts! (>= confirmations MIN-CONFIRMATIONS)
            ERR-INSUFFICIENT-CONFIRMATIONS
        )
        (asserts!
            (is-none (map-get? completed-transfers { btc-tx-hash: btc-tx-hash }))
            ERR-ALREADY-PROCESSED
        )
        (asserts! (> amount u0) ERR-INVALID-AMOUNT)
        ;; Mint/transfer STX to recipient
        (try! (as-contract (stx-transfer? amount tx-sender recipient)))
        ;; Record completed transfer
        (map-set completed-transfers { btc-tx-hash: btc-tx-hash } {
            transfer-id: (var-get transfer-nonce),
            amount: amount,
            recipient: recipient,
            block-height: stacks-block-height,
        })
        (print {
            event: "incoming-transfer-completed",
            btc-tx-hash: btc-tx-hash,
            amount: amount,
            recipient: recipient,
        })
        (ok true)
    )
)
