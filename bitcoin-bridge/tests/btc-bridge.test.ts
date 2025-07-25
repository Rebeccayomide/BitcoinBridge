import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const simnet = (globalThis as any).simnet;

const accounts = simnet.getAccounts();
const address1 = accounts.get("wallet_1")!;
const address2 = accounts.get("wallet_2")!;
const address3 = accounts.get("wallet_3")!;
const deployer = accounts.get("deployer")!;

const contractName = "btc-bridge";

// Constants
const MIN_CONFIRMATIONS = 6;
const BRIDGE_FEE = 1000;
const MAX_TRANSFER_AMOUNT = 100000000; // 1 BTC in satoshis

// Mock data
const mockBtcTxHash = Cl.bufferFromHex("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
const mockRecipientAddress = Cl.bufferFromHex("742d35cc6634c0532925a3b8d421c5a8e8d8c8e8");

describe("BitcoinBridge Contract Tests", () => {
  beforeEach(() => {
    simnet.mineEmptyBlocks(1);
  });

  describe("Read-Only Functions", () => {
    it("get-transfer-details returns none for non-existent transfer", () => {
      const { result } = simnet.callReadOnlyFn(contractName, "get-transfer-details", [Cl.uint(999)], deployer);
      expect(result).toBeNone();
    });

    it("get-completed-transfer returns none for non-existent hash", () => {
      const { result } = simnet.callReadOnlyFn(contractName, "get-completed-transfer", [mockBtcTxHash], deployer);
      expect(result).toBeNone();
    });

    it("get-user-balance returns 0 for user with no balance", () => {
      const { result } = simnet.callReadOnlyFn(contractName, "get-user-balance", [Cl.principal(address1)], deployer);
      expect(result).toBeUint(0);
    });

    it("get-bridge-stats returns correct initial values", () => {
      const { result } = simnet.callReadOnlyFn(contractName, "get-bridge-stats", [], deployer);
      expect(result).toBeTuple({
        "total-locked": Cl.uint(0),
        "transfer-nonce": Cl.uint(0),
        "bridge-paused": Cl.bool(false),
        "min-confirmations": Cl.uint(MIN_CONFIRMATIONS),
        "bridge-fee": Cl.uint(BRIDGE_FEE),
      });
    });

    it("is-network-supported returns true for supported networks", () => {
      const { result: ethereumResult } = simnet.callReadOnlyFn(contractName, "is-network-supported", [
        Cl.stringAscii("ethereum")
      ], deployer);
      expect(ethereumResult).toBeBool(true);

      const { result: polygonResult } = simnet.callReadOnlyFn(contractName, "is-network-supported", [
        Cl.stringAscii("polygon")
      ], deployer);
      expect(polygonResult).toBeBool(true);

      const { result: arbitrumResult } = simnet.callReadOnlyFn(contractName, "is-network-supported", [
        Cl.stringAscii("arbitrum")
      ], deployer);
      expect(arbitrumResult).toBeBool(true);
    });

    it("is-network-supported returns false for unsupported networks", () => {
      const { result } = simnet.callReadOnlyFn(contractName, "is-network-supported", [
        Cl.stringAscii("unsupported")
      ], deployer);
      expect(result).toBeBool(false);
    });

    it("get-contract-balance returns contract STX balance", () => {
      const { result } = simnet.callReadOnlyFn(contractName, "get-contract-balance", [], deployer);
      expect(result).toBeUint(expect.any(Number));
    });
  });

  describe("Initiate Bridge Transfer Function", () => {
    it("initiate-bridge-transfer allows valid transfer", () => {
      const transferAmount = 50000000; // 0.5 BTC
      const { result } = simnet.callPublicFn(contractName, "initiate-bridge-transfer", [
        Cl.uint(transferAmount),
        mockRecipientAddress,
        Cl.stringAscii("ethereum")
      ], address1);
      
      expect(result).toBeOk(Cl.uint(0)); // First transfer ID should be 0
    });

    it("initiate-bridge-transfer stores transfer details correctly", () => {
      const transferAmount = 50000000;
      simnet.callPublicFn(contractName, "initiate-bridge-transfer", [
        Cl.uint(transferAmount),
        mockRecipientAddress,
        Cl.stringAscii("ethereum")
      ], address1);

      const { result } = simnet.callReadOnlyFn(contractName, "get-transfer-details", [Cl.uint(0)], deployer);
      expect(result).toBeSome(
        Cl.tuple({
          sender: Cl.principal(address1),
          recipient: mockRecipientAddress,
          amount: Cl.uint(transferAmount),
          "target-network": Cl.stringAscii("ethereum"),
          "block-height": Cl.uint(simnet.blockHeight),
          processed: Cl.bool(false),
        })
      );
    });

    it("initiate-bridge-transfer updates user balance", () => {
      const transferAmount = 50000000;
      simnet.callPublicFn(contractName, "initiate-bridge-transfer", [
        Cl.uint(transferAmount),
        mockRecipientAddress,
        Cl.stringAscii("ethereum")
      ], address1);

      const { result } = simnet.callReadOnlyFn(contractName, "get-user-balance", [Cl.principal(address1)], deployer);
      expect(result).toBeUint(transferAmount);
    });

    it("initiate-bridge-transfer updates bridge stats", () => {
      const transferAmount = 50000000;
      simnet.callPublicFn(contractName, "initiate-bridge-transfer", [
        Cl.uint(transferAmount),
        mockRecipientAddress,
        Cl.stringAscii("ethereum")
      ], address1);

      const { result } = simnet.callReadOnlyFn(contractName, "get-bridge-stats", [], deployer);
      expect(result).toBeTuple({
        "total-locked": Cl.uint(transferAmount),
        "transfer-nonce": Cl.uint(1),
        "bridge-paused": Cl.bool(false),
        "min-confirmations": Cl.uint(MIN_CONFIRMATIONS),
        "bridge-fee": Cl.uint(BRIDGE_FEE),
      });
    });

    it("initiate-bridge-transfer validates amount bounds", () => {
      // Zero amount
      let { result } = simnet.callPublicFn(contractName, "initiate-bridge-transfer", [
        Cl.uint(0),
        mockRecipientAddress,
        Cl.stringAscii("ethereum")
      ], address1);
      expect(result).toBeErr(Cl.uint(101)); // ERR-INVALID-AMOUNT

      // Amount exceeding maximum
      ({ result } = simnet.callPublicFn(contractName, "initiate-bridge-transfer", [
        Cl.uint(MAX_TRANSFER_AMOUNT + 1),
        mockRecipientAddress,
        Cl.stringAscii("ethereum")
      ], address1));
      expect(result).toBeErr(Cl.uint(101)); // ERR-INVALID-AMOUNT
    });

    it("initiate-bridge-transfer validates network support", () => {
      const { result } = simnet.callPublicFn(contractName, "initiate-bridge-transfer", [
        Cl.uint(10000000),
        mockRecipientAddress,
        Cl.stringAscii("unsupported")
      ], address1);
      
      expect(result).toBeErr(Cl.uint(105)); // ERR-INVALID-NETWORK
    });

    it("initiate-bridge-transfer prevents transfer when bridge is paused", () => {
      // Pause bridge
      simnet.callPublicFn(contractName, "toggle-bridge-pause", [], deployer);

      const { result } = simnet.callPublicFn(contractName, "initiate-bridge-transfer", [
        Cl.uint(10000000),
        mockRecipientAddress,
        Cl.stringAscii("ethereum")
      ], address1);
      
      expect(result).toBeErr(Cl.uint(106)); // ERR-BRIDGE-PAUSED
    });

    it("initiate-bridge-transfer accumulates user balance", () => {
      const firstAmount = 30000000;
      const secondAmount = 20000000;

      // First transfer
      simnet.callPublicFn(contractName, "initiate-bridge-transfer", [
        Cl.uint(firstAmount),
        mockRecipientAddress,
        Cl.stringAscii("ethereum")
      ], address1);

      // Second transfer
      simnet.callPublicFn(contractName, "initiate-bridge-transfer", [
        Cl.uint(secondAmount),
        mockRecipientAddress,
        Cl.stringAscii("polygon")
      ], address1);

      const { result } = simnet.callReadOnlyFn(contractName, "get-user-balance", [Cl.principal(address1)], deployer);
      expect(result).toBeUint(firstAmount + secondAmount);
    });
  });

  describe("Complete Incoming Transfer Function", () => {
    it("complete-incoming-transfer allows owner to complete transfer", () => {
      const transferAmount = 25000000;
      const { result } = simnet.callPublicFn(contractName, "complete-incoming-transfer", [
        mockBtcTxHash,
        Cl.uint(transferAmount),
        Cl.principal(address1),
        Cl.uint(MIN_CONFIRMATIONS)
      ], deployer);
      
      expect(result).toBeOk(Cl.bool(true));
    });

    it("complete-incoming-transfer stores completed transfer details", () => {
      const transferAmount = 25000000;
      simnet.callPublicFn(contractName, "complete-incoming-transfer", [
        mockBtcTxHash,
        Cl.uint(transferAmount),
        Cl.principal(address1),
        Cl.uint(MIN_CONFIRMATIONS)
      ], deployer);

      const { result } = simnet.callReadOnlyFn(contractName, "get-completed-transfer", [mockBtcTxHash], deployer);
      expect(result).toBeSome(
        Cl.tuple({
          "transfer-id": Cl.uint(expect.any(Number)),
          amount: Cl.uint(transferAmount),
          recipient: Cl.principal(address1),
          "block-height": Cl.uint(simnet.blockHeight),
        })
      );
    });

    it("complete-incoming-transfer prevents non-owner from completing", () => {
      const { result } = simnet.callPublicFn(contractName, "complete-incoming-transfer", [
        mockBtcTxHash,
        Cl.uint(25000000),
        Cl.principal(address1),
        Cl.uint(MIN_CONFIRMATIONS)
      ], address1);
      
      expect(result).toBeErr(Cl.uint(100)); // ERR-UNAUTHORIZED
    });

    it("complete-incoming-transfer validates minimum confirmations", () => {
      const { result } = simnet.callPublicFn(contractName, "complete-incoming-transfer", [
        mockBtcTxHash,
        Cl.uint(25000000),
        Cl.principal(address1),
        Cl.uint(MIN_CONFIRMATIONS - 1)
      ], deployer);
      
      expect(result).toBeErr(Cl.uint(104)); // ERR-INSUFFICIENT-CONFIRMATIONS
    });

    it("complete-incoming-transfer validates amount", () => {
      const { result } = simnet.callPublicFn(contractName, "complete-incoming-transfer", [
        mockBtcTxHash,
        Cl.uint(0), // Invalid zero amount
        Cl.principal(address1),
        Cl.uint(MIN_CONFIRMATIONS)
      ], deployer);
      
      expect(result).toBeErr(Cl.uint(101)); // ERR-INVALID-AMOUNT
    });

    it("complete-incoming-transfer prevents double processing", () => {
      const transferAmount = 25000000;
      
      // First completion
      simnet.callPublicFn(contractName, "complete-incoming-transfer", [
        mockBtcTxHash,
        Cl.uint(transferAmount),
        Cl.principal(address1),
        Cl.uint(MIN_CONFIRMATIONS)
      ], deployer);

      // Second completion attempt
      const { result } = simnet.callPublicFn(contractName, "complete-incoming-transfer", [
        mockBtcTxHash,
        Cl.uint(transferAmount),
        Cl.principal(address1),
        Cl.uint(MIN_CONFIRMATIONS)
      ], deployer);
      
      expect(result).toBeErr(Cl.uint(103)); // ERR-ALREADY-PROCESSED
    });
  });

  describe("Mark Transfer Processed Function", () => {
    beforeEach(() => {
      // Setup: Create a pending transfer
      simnet.callPublicFn(contractName, "initiate-bridge-transfer", [
        Cl.uint(50000000),
        mockRecipientAddress,
        Cl.stringAscii("ethereum")
      ], address1);
    });

    it("mark-transfer-processed allows owner to mark transfer as processed", () => {
      const { result } = simnet.callPublicFn(contractName, "mark-transfer-processed", [
        Cl.uint(0)
      ], deployer);
      
      expect(result).toBeOk(Cl.bool(true));
    });

    it("mark-transfer-processed updates transfer status", () => {
      simnet.callPublicFn(contractName, "mark-transfer-processed", [Cl.uint(0)], deployer);

      const { result } = simnet.callReadOnlyFn(contractName, "get-transfer-details", [Cl.uint(0)], deployer);
      expect(result).toBeSome(
        Cl.tuple({
          sender: Cl.principal(address1),
          recipient: mockRecipientAddress,
          amount: Cl.uint(50000000),
          "target-network": Cl.stringAscii("ethereum"),
          "block-height": Cl.uint(expect.any(Number)),
          processed: Cl.bool(true), // Updated to true
        })
      );
    });

    it("mark-transfer-processed prevents non-owner from marking", () => {
      const { result } = simnet.callPublicFn(contractName, "mark-transfer-processed", [
        Cl.uint(0)
      ], address1);
      
      expect(result).toBeErr(Cl.uint(100)); // ERR-UNAUTHORIZED
    });

    it("mark-transfer-processed prevents marking non-existent transfer", () => {
      const { result } = simnet.callPublicFn(contractName, "mark-transfer-processed", [
        Cl.uint(999)
      ], deployer);
      
      expect(result).toBeErr(Cl.uint(102)); // ERR-TRANSFER-NOT-FOUND
    });

    it("mark-transfer-processed prevents double processing", () => {
      // First processing
      simnet.callPublicFn(contractName, "mark-transfer-processed", [Cl.uint(0)], deployer);

      // Second processing attempt
      const { result } = simnet.callPublicFn(contractName, "mark-transfer-processed", [
        Cl.uint(0)
      ], deployer);
      
      expect(result).toBeErr(Cl.uint(103)); // ERR-ALREADY-PROCESSED
    });
  });

  describe("Toggle Bridge Pause Function", () => {
    it("toggle-bridge-pause allows owner to pause bridge", () => {
      const { result } = simnet.callPublicFn(contractName, "toggle-bridge-pause", [], deployer);
      expect(result).toBeOk(Cl.bool(true)); // Returns new paused state
    });

    it("toggle-bridge-pause updates bridge stats", () => {
      simnet.callPublicFn(contractName, "toggle-bridge-pause", [], deployer);

      const { result } = simnet.callReadOnlyFn(contractName, "get-bridge-stats", [], deployer);
      expect(result).toBeTuple({
        "total-locked": Cl.uint(0),
        "transfer-nonce": Cl.uint(0),
        "bridge-paused": Cl.bool(true), // Updated to true
        "min-confirmations": Cl.uint(MIN_CONFIRMATIONS),
        "bridge-fee": Cl.uint(BRIDGE_FEE),
      });
    });

    it("toggle-bridge-pause allows toggling back to unpaused", () => {
      // Pause
      simnet.callPublicFn(contractName, "toggle-bridge-pause", [], deployer);
      
      // Unpause
      const { result } = simnet.callPublicFn(contractName, "toggle-bridge-pause", [], deployer);
      expect(result).toBeOk(Cl.bool(false)); // Returns new paused state (false)
    });

    it("toggle-bridge-pause prevents non-owner from toggling", () => {
      const { result } = simnet.callPublicFn(contractName, "toggle-bridge-pause", [], address1);
      expect(result).toBeErr(Cl.uint(100)); // ERR-UNAUTHORIZED
    });
  });

  describe("Update Network Support Function", () => {
    it("update-network-support allows owner to add new network", () => {
      const newNetwork = "bsc";
      const { result } = simnet.callPublicFn(contractName, "update-network-support", [
        Cl.stringAscii(newNetwork),
        Cl.bool(true)
      ], deployer);
      
      expect(result).toBeOk(Cl.bool(true));
    });

    it("update-network-support updates network status", () => {
      const newNetwork = "bsc";
      simnet.callPublicFn(contractName, "update-network-support", [
        Cl.stringAscii(newNetwork),
        Cl.bool(true)
      ], deployer);

      const { result } = simnet.callReadOnlyFn(contractName, "is-network-supported", [
        Cl.stringAscii(newNetwork)
      ], deployer);
      expect(result).toBeBool(true);
    });

    it("update-network-support allows disabling existing network", () => {
      simnet.callPublicFn(contractName, "update-network-support", [
        Cl.stringAscii("ethereum"),
        Cl.bool(false)
      ], deployer);

      const { result } = simnet.callReadOnlyFn(contractName, "is-network-supported", [
        Cl.stringAscii("ethereum")
      ], deployer);
      expect(result).toBeBool(false);
    });

    it("update-network-support prevents non-owner from updating", () => {
      const { result } = simnet.callPublicFn(contractName, "update-network-support", [
        Cl.stringAscii("newnetwork"),
        Cl.bool(true)
      ], address1);
      
      expect(result).toBeErr(Cl.uint(100)); // ERR-UNAUTHORIZED
    });
  });

  describe("Emergency Withdraw Function", () => {
    beforeEach(() => {
      // Setup: Create some transfers to have contract balance
      simnet.callPublicFn(contractName, "initiate-bridge-transfer", [
        Cl.uint(50000000),
        mockRecipientAddress,
        Cl.stringAscii("ethereum")
      ], address1);
    });

    it("emergency-withdraw prevents withdrawal when bridge is not paused", () => {
      const { result } = simnet.callPublicFn(contractName, "emergency-withdraw", [
        Cl.uint(10000000)
      ], deployer);
      
      expect(result).toBeErr(Cl.uint(106)); // ERR-BRIDGE-PAUSED
    });

    it("emergency-withdraw allows owner to withdraw when paused", () => {
      // Pause bridge first
      simnet.callPublicFn(contractName, "toggle-bridge-pause", [], deployer);

      const { result } = simnet.callPublicFn(contractName, "emergency-withdraw", [
        Cl.uint(10000000)
      ], deployer);
      
      expect(result).toBeOk(Cl.bool(true));
    });

    it("emergency-withdraw prevents non-owner from withdrawing", () => {
      // Pause bridge first
      simnet.callPublicFn(contractName, "toggle-bridge-pause", [], deployer);

      const { result } = simnet.callPublicFn(contractName, "emergency-withdraw", [
        Cl.uint(10000000)
      ], address1);
      
      expect(result).toBeErr(Cl.uint(100)); // ERR-UNAUTHORIZED
    });
  });

  describe("Integration Tests", () => {
    it("handles complete bridge transfer workflow", () => {
      const transferAmount = 75000000;
      
      // 1. Initiate bridge transfer
      const { result: initiateResult } = simnet.callPublicFn(contractName, "initiate-bridge-transfer", [
        Cl.uint(transferAmount),
        mockRecipientAddress,
        Cl.stringAscii("ethereum")
      ], address1);
      expect(initiateResult).toBeOk(Cl.uint(0));

      // 2. Check transfer details
      const { result: transferDetails } = simnet.callReadOnlyFn(contractName, "get-transfer-details", [Cl.uint(0)], deployer);
      expect(transferDetails).toBeSome(
        Cl.tuple({
          sender: Cl.principal(address1),
          recipient: mockRecipientAddress,
          amount: Cl.uint(transferAmount),
          "target-network": Cl.stringAscii("ethereum"),
          "block-height": Cl.uint(expect.any(Number)),
          processed: Cl.bool(false),
        })
      );

      // 3. Mark as processed
      const { result: processResult } = simnet.callPublicFn(contractName, "mark-transfer-processed", [
        Cl.uint(0)
      ], deployer);
      expect(processResult).toBeOk(Cl.bool(true));

      // 4. Verify processed status
      const { result: updatedDetails } = simnet.callReadOnlyFn(contractName, "get-transfer-details", [Cl.uint(0)], deployer);
      expect(updatedDetails).toBeSome(
        Cl.tuple({
          sender: Cl.principal(address1),
          recipient: mockRecipientAddress,
          amount: Cl.uint(transferAmount),
          "target-network": Cl.stringAscii("ethereum"),
          "block-height": Cl.uint(expect.any(Number)),
          processed: Cl.bool(true),
        })
      );
    });

    it("handles multiple users and network management", () => {
      const amount1 = 30000000;
      const amount2 = 40000000;
      const customNetwork = "avalanche";

      // 1. Multiple transfers from different users
      simnet.callPublicFn(contractName, "initiate-bridge-transfer", [
        Cl.uint(amount1),
        mockRecipientAddress,
        Cl.stringAscii("ethereum")
      ], address1);

      simnet.callPublicFn(contractName, "initiate-bridge-transfer", [
        Cl.uint(amount2),
        mockRecipientAddress,
        Cl.stringAscii("polygon")
      ], address2);

      // 2. Add new network
      simnet.callPublicFn(contractName, "update-network-support", [
        Cl.stringAscii(customNetwork),
        Cl.bool(true)
      ], deployer);

      // 3. Use new network
      const { result } = simnet.callPublicFn(contractName, "initiate-bridge-transfer", [
        Cl.uint(20000000),
        mockRecipientAddress,
        Cl.stringAscii(customNetwork)
      ], address3);
      expect(result).toBeOk(Cl.uint(2));

      // 4. Verify total stats
      const { result: stats } = simnet.callReadOnlyFn(contractName, "get-bridge-stats", [], deployer);
      expect(stats).toBeTuple({
        "total-locked": Cl.uint(amount1 + amount2 + 20000000),
        "transfer-nonce": Cl.uint(3),
        "bridge-paused": Cl.bool(false),
        "min-confirmations": Cl.uint(MIN_CONFIRMATIONS),
        "bridge-fee": Cl.uint(BRIDGE_FEE),
      });
    });
  });
});