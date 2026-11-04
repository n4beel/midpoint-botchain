// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Midpoint} from "../src/Midpoint.sol";

contract MidpointHandler is Test {
  Midpoint public midpoint;

  address public seller = address(0xA11);
  address public buyer = address(0xB22);
  address public observer = address(0xC33);

  uint256 public activeDeals;
  uint256 public totalEscrowed;

  mapping(uint256 => bool) public buyerCommitted;
  mapping(uint256 => uint128) public dealCeilings;
  mapping(uint256 => bool) public dealSettled;

  constructor(Midpoint _midpoint) {
    midpoint = _midpoint;
    vm.deal(seller, 1_000_000 ether);
    vm.deal(buyer, 1_000_000 ether);
    vm.deal(observer, 1_000_000 ether);
  }

  function openDeal(uint128 ceiling, uint32 commitSecs, uint32 revealSecs)
    external
    returns (uint256 id)
  {
    ceiling = uint128(bound(ceiling, 0.01 ether, 100 ether));
    commitSecs = uint32(bound(commitSecs, 1 hours, 7 days));
    revealSecs = uint32(bound(revealSecs, 1 hours, 7 days));

    vm.prank(seller);
    try midpoint.open(buyer, "Invariant Deal", "Terms", ceiling, commitSecs, revealSecs) returns (
      uint256 newId
    ) {
      id = newId;
      dealCeilings[id] = ceiling;
      activeDeals++;
    } catch {}
  }

  function commitSeller(uint256 dealId, uint128 ask, bytes32 salt) external {
    if (dealId == 0 || dealId > midpoint.dealCount()) return;
    bytes32 c = keccak256(abi.encode(dealId, seller, ask, salt));
    vm.prank(seller);
    try midpoint.commit(dealId, c) {} catch {}
  }

  function commitBuyer(uint256 dealId, uint128 bid, bytes32 salt) external {
    if (dealId == 0 || dealId > midpoint.dealCount()) return;
    uint128 ceiling = dealCeilings[dealId];
    if (ceiling == 0) return;
    bytes32 c = keccak256(abi.encode(dealId, buyer, bid, salt));
    vm.prank(buyer);
    try midpoint.commit{value: ceiling}(dealId, c) {
      buyerCommitted[dealId] = true;
    } catch {}
  }

  function revealSeller(uint256 dealId, uint128 ask, bytes32 salt) external {
    if (dealId == 0 || dealId > midpoint.dealCount()) return;
    vm.prank(seller);
    try midpoint.reveal(dealId, ask, salt) {} catch {}
  }

  function revealBuyer(uint256 dealId, uint128 bid, bytes32 salt) external {
    if (dealId == 0 || dealId > midpoint.dealCount()) return;
    vm.prank(buyer);
    try midpoint.reveal(dealId, bid, salt) {} catch {}
  }

  function settle(uint256 dealId) external {
    if (dealId == 0 || dealId > midpoint.dealCount()) return;
    vm.prank(observer);
    try midpoint.settle(dealId) {
      dealSettled[dealId] = true;
    } catch {}
  }

  function withdraw(uint8 who) external {
    address target = who % 3 == 0 ? seller : (who % 3 == 1 ? buyer : observer);
    vm.prank(target);
    try midpoint.withdraw() {} catch {}
  }

  function warpTime(uint32 secs) external {
    secs = uint32(bound(secs, 1, 14 days));
    vm.warp(block.timestamp + secs);
  }

  function outstandingEscrow() external view returns (uint256 total) {
    uint256 count = midpoint.dealCount();
    for (uint256 i = 1; i <= count; i++) {
      Midpoint.Deal memory d = midpoint.dealOf(i);
      if (
        d.buyerCommit != bytes32(0) && d.state != Midpoint.State.Settled
          && d.state != Midpoint.State.Void
      ) {
        total += d.ceiling;
      }
    }
  }
}

contract MidpointInvariantTest is Test {
  Midpoint public midpoint;
  MidpointHandler public handler;

  function setUp() public {
    vm.warp(1_760_000_000);
    midpoint = new Midpoint();
    handler = new MidpointHandler(midpoint);
    targetContract(address(handler));
  }

  function invariant_BalanceEqualsEscrowPlusPending() public view {
    uint256 balance = address(midpoint).balance;
    uint256 escrow = handler.outstandingEscrow();
    uint256 pendingTotal = midpoint.pending(handler.seller()) + midpoint.pending(handler.buyer())
      + midpoint.pending(handler.observer());

    assertEq(balance, escrow + pendingTotal, "Invariant broken: balance != escrow + pending");
  }
}
