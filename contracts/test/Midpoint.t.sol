// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test, console2} from "forge-std/Test.sol";
import {Midpoint} from "../src/Midpoint.sol";

contract MidpointTest is Test {
  Midpoint public midpoint;

  address public seller = address(0x1111);
  address public buyer = address(0x2222);
  address public stranger = address(0x3333);

  uint128 public constant DEFAULT_CEILING = 1 ether;
  uint64 public constant DEFAULT_COMMIT_SECS = 1 hours;
  uint32 public constant DEFAULT_REVEAL_SECS = 1 hours;

  event Opened(
    uint256 indexed id,
    address indexed seller,
    address indexed buyer,
    string title,
    string terms,
    uint128 ceiling,
    uint64 commitBy,
    uint32 revealSecs
  );
  event Committed(uint256 indexed id, address indexed who, bool bothIn);
  event Revealed(uint256 indexed id, address indexed who, uint128 price);
  event Settled(uint256 indexed id, uint128 price, bool traded);
  event Cancelled(uint256 indexed id);
  event Withdrawn(address indexed to, uint256 amount);

  function setUp() public {
    vm.warp(1_760_000_000);
    midpoint = new Midpoint();
    vm.deal(seller, 100 ether);
    vm.deal(buyer, 100 ether);
    vm.deal(stranger, 100 ether);
  }

  function _openDefaultDeal() internal returns (uint256 id) {
    vm.prank(seller);
    id = midpoint.open(
      buyer,
      "Vintage Watch",
      "Mint condition 1968 chrono",
      DEFAULT_CEILING,
      DEFAULT_COMMIT_SECS,
      DEFAULT_REVEAL_SECS
    );
  }

  function _calcCommitment(uint256 id, address who, uint128 price, bytes32 salt)
    internal
    pure
    returns (bytes32)
  {
    return keccak256(abi.encode(id, who, price, salt));
  }

  // --- Tests required by Spec §2.3 ---

  function test_OpenMovesNoMoney() public {
    uint256 sellerBalBefore = seller.balance;
    uint256 contractBalBefore = address(midpoint).balance;

    vm.prank(seller);
    uint256 id = midpoint.open(
      buyer, "Test Deal", "Terms", DEFAULT_CEILING, DEFAULT_COMMIT_SECS, DEFAULT_REVEAL_SECS
    );

    assertEq(id, 1);
    assertEq(seller.balance, sellerBalBefore);
    assertEq(address(midpoint).balance, contractBalBefore);

    Midpoint.Deal memory d = midpoint.dealOf(id);
    assertEq(d.seller, seller);
    assertEq(d.buyer, buyer);
    assertEq(uint256(d.state), uint256(Midpoint.State.Open));
    assertEq(d.commitBy, 1_760_000_000 + DEFAULT_COMMIT_SECS);
    assertEq(d.revealSecs, DEFAULT_REVEAL_SECS);
    assertEq(d.ceiling, DEFAULT_CEILING);
    assertEq(d.title, "Test Deal");
  }

  function test_BadBuyerTextParamsRevert() public {
    // Bad buyer zero
    vm.expectRevert(Midpoint.BadBuyer.selector);
    vm.prank(seller);
    midpoint.open(
      address(0), "T", "Terms", DEFAULT_CEILING, DEFAULT_COMMIT_SECS, DEFAULT_REVEAL_SECS
    );

    // Bad buyer self
    vm.expectRevert(Midpoint.BadBuyer.selector);
    vm.prank(seller);
    midpoint.open(seller, "T", "Terms", DEFAULT_CEILING, DEFAULT_COMMIT_SECS, DEFAULT_REVEAL_SECS);

    // Bad title empty
    vm.expectRevert(Midpoint.BadText.selector);
    vm.prank(seller);
    midpoint.open(buyer, "", "Terms", DEFAULT_CEILING, DEFAULT_COMMIT_SECS, DEFAULT_REVEAL_SECS);

    // Bad title too long (> 64 bytes)
    string memory longTitle = new string(65);
    vm.expectRevert(Midpoint.BadText.selector);
    vm.prank(seller);
    midpoint.open(
      buyer, longTitle, "Terms", DEFAULT_CEILING, DEFAULT_COMMIT_SECS, DEFAULT_REVEAL_SECS
    );

    // Bad terms too long (> 300 bytes)
    string memory longTerms = new string(301);
    vm.expectRevert(Midpoint.BadText.selector);
    vm.prank(seller);
    midpoint.open(
      buyer, "Title", longTerms, DEFAULT_CEILING, DEFAULT_COMMIT_SECS, DEFAULT_REVEAL_SECS
    );

    // Bad ceiling < MIN_CEILING
    vm.expectRevert(Midpoint.BadParams.selector);
    vm.prank(seller);
    midpoint.open(buyer, "Title", "Terms", 0.009 ether, DEFAULT_COMMIT_SECS, DEFAULT_REVEAL_SECS);

    // Bad ceiling > MAX_CEILING
    vm.expectRevert(Midpoint.BadParams.selector);
    vm.prank(seller);
    midpoint.open(buyer, "Title", "Terms", 100_001 ether, DEFAULT_COMMIT_SECS, DEFAULT_REVEAL_SECS);

    // Bad commitSecs < MIN_WINDOW
    vm.expectRevert(Midpoint.BadParams.selector);
    vm.prank(seller);
    midpoint.open(buyer, "Title", "Terms", DEFAULT_CEILING, 59 minutes, DEFAULT_REVEAL_SECS);

    // Bad commitSecs > MAX_WINDOW
    vm.expectRevert(Midpoint.BadParams.selector);
    vm.prank(seller);
    midpoint.open(buyer, "Title", "Terms", DEFAULT_CEILING, 8 days, DEFAULT_REVEAL_SECS);

    // Bad revealSecs < MIN_WINDOW
    vm.expectRevert(Midpoint.BadParams.selector);
    vm.prank(seller);
    midpoint.open(buyer, "Title", "Terms", DEFAULT_CEILING, DEFAULT_COMMIT_SECS, 59 minutes);

    // Bad revealSecs > MAX_WINDOW
    vm.expectRevert(Midpoint.BadParams.selector);
    vm.prank(seller);
    midpoint.open(buyer, "Title", "Terms", DEFAULT_CEILING, DEFAULT_COMMIT_SECS, 8 days);
  }

  function test_BuyerMustEscrowCeiling_ArgsExpected() public {
    uint256 id = _openDefaultDeal();
    bytes32 c = _calcCommitment(id, buyer, 0.8 ether, bytes32(uint256(1)));

    // Wrong payment: 0 sent
    vm.expectRevert(
      abi.encodeWithSelector(Midpoint.WrongPayment.selector, uint256(DEFAULT_CEILING))
    );
    vm.prank(buyer);
    midpoint.commit{value: 0}(id, c);

    // Wrong payment: partial sent
    vm.expectRevert(
      abi.encodeWithSelector(Midpoint.WrongPayment.selector, uint256(DEFAULT_CEILING))
    );
    vm.prank(buyer);
    midpoint.commit{value: 0.5 ether}(id, c);

    // Correct payment
    vm.prank(buyer);
    midpoint.commit{value: DEFAULT_CEILING}(id, c);

    assertEq(address(midpoint).balance, DEFAULT_CEILING);
  }

  function test_SellerCommitSendsNothing() public {
    uint256 id = _openDefaultDeal();
    bytes32 c = _calcCommitment(id, seller, 0.5 ether, bytes32(uint256(1)));

    // Seller sending payment reverts
    vm.expectRevert(abi.encodeWithSelector(Midpoint.WrongPayment.selector, uint256(0)));
    vm.prank(seller);
    midpoint.commit{value: 0.1 ether}(id, c);

    // Seller sending 0 succeeds
    vm.prank(seller);
    midpoint.commit{value: 0}(id, c);

    assertEq(midpoint.commitmentOf(id, seller), c);
  }

  function test_StrangerCannotCommit() public {
    uint256 id = _openDefaultDeal();
    bytes32 c = _calcCommitment(id, stranger, 0.5 ether, bytes32(uint256(1)));

    vm.expectRevert(Midpoint.NotAParty.selector);
    vm.prank(stranger);
    midpoint.commit(id, c);
  }

  function test_CommitAfterWindowReverts() public {
    uint256 id = _openDefaultDeal();
    bytes32 c = _calcCommitment(id, seller, 0.5 ether, bytes32(uint256(1)));

    vm.warp(1_760_000_000 + DEFAULT_COMMIT_SECS);
    vm.expectRevert(Midpoint.CommitClosed.selector);
    vm.prank(seller);
    midpoint.commit(id, c);
  }

  function test_BothCommittedStartsReveal() public {
    uint256 id = _openDefaultDeal();
    bytes32 cs = _calcCommitment(id, seller, 0.5 ether, bytes32(uint256(1)));
    bytes32 cb = _calcCommitment(id, buyer, 0.8 ether, bytes32(uint256(2)));

    vm.prank(seller);
    midpoint.commit(id, cs);

    vm.warp(1_760_000_100);

    vm.expectEmit(true, true, false, true);
    emit Committed(id, buyer, true);

    vm.prank(buyer);
    midpoint.commit{value: DEFAULT_CEILING}(id, cb);

    Midpoint.Deal memory d = midpoint.dealOf(id);
    assertEq(uint256(d.state), uint256(Midpoint.State.Revealing));
    assertEq(d.revealBy, 1_760_000_100 + DEFAULT_REVEAL_SECS);
  }

  function test_RevealChecksHash_BadReveal() public {
    uint256 id = _openDefaultDeal();
    bytes32 saltSeller = bytes32(uint256(111));
    bytes32 cs = _calcCommitment(id, seller, 0.5 ether, saltSeller);
    bytes32 cb = _calcCommitment(id, buyer, 0.8 ether, bytes32(uint256(222)));

    vm.prank(seller);
    midpoint.commit(id, cs);
    vm.prank(buyer);
    midpoint.commit{value: DEFAULT_CEILING}(id, cb);

    // Wrong price
    vm.expectRevert(Midpoint.BadReveal.selector);
    vm.prank(seller);
    midpoint.reveal(id, 0.51 ether, saltSeller);

    // Wrong salt
    vm.expectRevert(Midpoint.BadReveal.selector);
    vm.prank(seller);
    midpoint.reveal(id, 0.5 ether, bytes32(uint256(999)));

    // Correct reveal succeeds
    vm.prank(seller);
    midpoint.reveal(id, 0.5 ether, saltSeller);

    // Double reveal reverts
    vm.expectRevert(Midpoint.AlreadyRevealed.selector);
    vm.prank(seller);
    midpoint.reveal(id, 0.5 ether, saltSeller);
  }

  function test_RevealBindsSenderAndDeal() public {
    uint256 id1 = _openDefaultDeal();
    uint256 id2 = _openDefaultDeal();

    bytes32 salt = bytes32(uint256(123));
    // Seller commits to id1
    bytes32 c1 = _calcCommitment(id1, seller, 0.5 ether, salt);
    bytes32 cb = _calcCommitment(id1, buyer, 0.8 ether, salt);

    vm.prank(seller);
    midpoint.commit(id1, c1);
    vm.prank(buyer);
    midpoint.commit{value: DEFAULT_CEILING}(id1, cb);

    // Try to reveal buyer using seller's address hash
    vm.expectRevert(Midpoint.BadReveal.selector);
    vm.prank(buyer);
    midpoint.reveal(id1, 0.5 ether, salt);

    // Try to reveal id2 using id1's commitment
    vm.prank(seller);
    midpoint.commit(id2, c1); // seller committed same hash
    vm.prank(buyer);
    midpoint.commit{value: DEFAULT_CEILING}(id2, cb);

    // In id2, hash was for id1, so revealing with id2 params will not match c1
    vm.expectRevert(Midpoint.BadReveal.selector);
    vm.prank(seller);
    midpoint.reveal(id2, 0.5 ether, salt);
  }

  function test_BidAboveCeilingReverts_ArgsCeiling() public {
    uint256 id = _openDefaultDeal();
    bytes32 saltBuyer = bytes32(uint256(777));
    // Buyer commits to a price above ceiling
    uint128 highBid = DEFAULT_CEILING + 0.1 ether;
    bytes32 cb = _calcCommitment(id, buyer, highBid, saltBuyer);
    bytes32 cs = _calcCommitment(id, seller, 0.5 ether, bytes32(uint256(1)));

    vm.prank(seller);
    midpoint.commit(id, cs);
    vm.prank(buyer);
    midpoint.commit{value: DEFAULT_CEILING}(id, cb);

    vm.expectRevert(abi.encodeWithSelector(Midpoint.AboveCeiling.selector, DEFAULT_CEILING));
    vm.prank(buyer);
    midpoint.reveal(id, highBid, saltBuyer);
  }

  function test_TradeAtMidpoint_RefundsRest() public {
    uint256 id = _openDefaultDeal();
    bytes32 saltS = bytes32(uint256(10));
    bytes32 saltB = bytes32(uint256(20));

    uint128 ask = 0.4 ether;
    uint128 bid = 0.8 ether;

    vm.prank(seller);
    midpoint.commit(id, _calcCommitment(id, seller, ask, saltS));
    vm.prank(buyer);
    midpoint.commit{value: DEFAULT_CEILING}(id, _calcCommitment(id, buyer, bid, saltB));

    vm.prank(seller);
    midpoint.reveal(id, ask, saltS);
    vm.prank(buyer);
    midpoint.reveal(id, bid, saltB);

    uint128 expectedPrice = uint128((uint256(ask) + uint256(bid)) / 2); // 0.6 ether
    assertEq(expectedPrice, 0.6 ether);

    vm.expectEmit(true, false, false, true);
    emit Settled(id, expectedPrice, true);

    midpoint.settle(id);

    Midpoint.Deal memory d = midpoint.dealOf(id);
    assertEq(uint256(d.state), uint256(Midpoint.State.Settled));
    assertEq(d.price, expectedPrice);

    assertEq(midpoint.pending(seller), expectedPrice);
    assertEq(midpoint.pending(buyer), DEFAULT_CEILING - expectedPrice);
  }

  function test_MidpointRoundsDown() public {
    uint256 id = _openDefaultDeal();
    bytes32 saltS = bytes32(uint256(10));
    bytes32 saltB = bytes32(uint256(20));

    uint128 ask = 101;
    uint128 bid = 102;

    vm.prank(seller);
    midpoint.commit(id, _calcCommitment(id, seller, ask, saltS));
    vm.prank(buyer);
    midpoint.commit{value: DEFAULT_CEILING}(id, _calcCommitment(id, buyer, bid, saltB));

    vm.prank(seller);
    midpoint.reveal(id, ask, saltS);
    vm.prank(buyer);
    midpoint.reveal(id, bid, saltB);

    midpoint.settle(id);

    Midpoint.Deal memory d = midpoint.dealOf(id);
    assertEq(d.price, 101); // (101 + 102)/2 = 101
  }

  function test_BidEqualsAskTradesAtThatPrice() public {
    uint256 id = _openDefaultDeal();
    bytes32 saltS = bytes32(uint256(10));
    bytes32 saltB = bytes32(uint256(20));

    uint128 ask = 0.5 ether;
    uint128 bid = 0.5 ether;

    vm.prank(seller);
    midpoint.commit(id, _calcCommitment(id, seller, ask, saltS));
    vm.prank(buyer);
    midpoint.commit{value: DEFAULT_CEILING}(id, _calcCommitment(id, buyer, bid, saltB));

    vm.prank(seller);
    midpoint.reveal(id, ask, saltS);
    vm.prank(buyer);
    midpoint.reveal(id, bid, saltB);

    midpoint.settle(id);

    Midpoint.Deal memory d = midpoint.dealOf(id);
    assertEq(uint256(d.state), uint256(Midpoint.State.Settled));
    assertEq(d.price, 0.5 ether);
    assertEq(midpoint.pending(seller), 0.5 ether);
    assertEq(midpoint.pending(buyer), 0.5 ether);
  }

  function test_BidBelowAskVoidsAndRefunds() public {
    uint256 id = _openDefaultDeal();
    bytes32 saltS = bytes32(uint256(10));
    bytes32 saltB = bytes32(uint256(20));

    uint128 ask = 0.7 ether;
    uint128 bid = 0.4 ether;

    vm.prank(seller);
    midpoint.commit(id, _calcCommitment(id, seller, ask, saltS));
    vm.prank(buyer);
    midpoint.commit{value: DEFAULT_CEILING}(id, _calcCommitment(id, buyer, bid, saltB));

    vm.prank(seller);
    midpoint.reveal(id, ask, saltS);
    vm.prank(buyer);
    midpoint.reveal(id, bid, saltB);

    vm.expectEmit(true, false, false, true);
    emit Settled(id, 0, false);

    midpoint.settle(id);

    Midpoint.Deal memory d = midpoint.dealOf(id);
    assertEq(uint256(d.state), uint256(Midpoint.State.Void));
    assertEq(d.price, 0);
    assertEq(midpoint.pending(seller), 0);
    assertEq(midpoint.pending(buyer), DEFAULT_CEILING);
  }

  function test_NoRevealByBuyerVoidsAndRefunds() public {
    uint256 id = _openDefaultDeal();
    bytes32 saltS = bytes32(uint256(10));

    vm.prank(seller);
    midpoint.commit(id, _calcCommitment(id, seller, 0.4 ether, saltS));
    vm.prank(buyer);
    midpoint.commit{value: DEFAULT_CEILING}(
      id, _calcCommitment(id, buyer, 0.8 ether, bytes32(uint256(20)))
    );

    vm.prank(seller);
    midpoint.reveal(id, 0.4 ether, saltS);

    // Warp past revealBy
    vm.warp(1_760_000_000 + DEFAULT_COMMIT_SECS + DEFAULT_REVEAL_SECS + 1);

    midpoint.settle(id);

    Midpoint.Deal memory d = midpoint.dealOf(id);
    assertEq(uint256(d.state), uint256(Midpoint.State.Void));
    assertEq(midpoint.pending(seller), 0);
    assertEq(midpoint.pending(buyer), DEFAULT_CEILING);
  }

  function test_NoRevealBySellerVoidsAndRefunds() public {
    uint256 id = _openDefaultDeal();
    bytes32 saltB = bytes32(uint256(20));

    vm.prank(seller);
    midpoint.commit(id, _calcCommitment(id, seller, 0.4 ether, bytes32(uint256(10))));
    vm.prank(buyer);
    midpoint.commit{value: DEFAULT_CEILING}(id, _calcCommitment(id, buyer, 0.8 ether, saltB));

    vm.prank(buyer);
    midpoint.reveal(id, 0.8 ether, saltB);

    vm.warp(1_760_000_000 + DEFAULT_COMMIT_SECS + DEFAULT_REVEAL_SECS + 1);

    midpoint.settle(id);

    Midpoint.Deal memory d = midpoint.dealOf(id);
    assertEq(uint256(d.state), uint256(Midpoint.State.Void));
    assertEq(midpoint.pending(seller), 0);
    assertEq(midpoint.pending(buyer), DEFAULT_CEILING);
  }

  function test_NobodyCommittedByDeadlineVoids() public {
    uint256 id = _openDefaultDeal();

    // Settle before commitBy reverts NotSettleable
    vm.expectRevert(Midpoint.NotSettleable.selector);
    midpoint.settle(id);

    vm.warp(1_760_000_000 + DEFAULT_COMMIT_SECS);

    midpoint.settle(id);

    Midpoint.Deal memory d = midpoint.dealOf(id);
    assertEq(uint256(d.state), uint256(Midpoint.State.Void));
    assertEq(midpoint.pending(buyer), 0);
  }

  function test_BuyerOnlyCommittedRefundedOnVoid() public {
    uint256 id = _openDefaultDeal();

    vm.prank(buyer);
    midpoint.commit{value: DEFAULT_CEILING}(
      id, _calcCommitment(id, buyer, 0.8 ether, bytes32(uint256(20)))
    );

    vm.warp(1_760_000_000 + DEFAULT_COMMIT_SECS);

    midpoint.settle(id);

    Midpoint.Deal memory d = midpoint.dealOf(id);
    assertEq(uint256(d.state), uint256(Midpoint.State.Void));
    assertEq(midpoint.pending(buyer), DEFAULT_CEILING);
  }

  function test_CancelBeforeBuyerCommits() public {
    uint256 id = _openDefaultDeal();

    // Stranger cannot cancel
    vm.expectRevert(Midpoint.NotSeller.selector);
    vm.prank(stranger);
    midpoint.cancel(id);

    // Seller commits first
    vm.prank(seller);
    midpoint.commit(id, _calcCommitment(id, seller, 0.4 ether, bytes32(uint256(10))));

    // Seller cancels
    vm.expectEmit(true, false, false, false);
    emit Cancelled(id);

    vm.prank(seller);
    midpoint.cancel(id);

    Midpoint.Deal memory d = midpoint.dealOf(id);
    assertEq(uint256(d.state), uint256(Midpoint.State.Void));

    // Now buyer committing reverts CommitClosed
    vm.expectRevert(Midpoint.CommitClosed.selector);
    vm.prank(buyer);
    midpoint.commit{value: DEFAULT_CEILING}(id, bytes32(uint256(999)));
  }

  function test_CancelAfterBuyerCommitsReverts() public {
    uint256 id = _openDefaultDeal();

    vm.prank(buyer);
    midpoint.commit{value: DEFAULT_CEILING}(
      id, _calcCommitment(id, buyer, 0.8 ether, bytes32(uint256(20)))
    );

    vm.expectRevert(Midpoint.BuyerCommitted.selector);
    vm.prank(seller);
    midpoint.cancel(id);
  }

  function test_SettleOnce() public {
    uint256 id = _openDefaultDeal();
    bytes32 saltS = bytes32(uint256(10));
    bytes32 saltB = bytes32(uint256(20));

    vm.prank(seller);
    midpoint.commit(id, _calcCommitment(id, seller, 0.4 ether, saltS));
    vm.prank(buyer);
    midpoint.commit{value: DEFAULT_CEILING}(id, _calcCommitment(id, buyer, 0.8 ether, saltB));

    vm.prank(seller);
    midpoint.reveal(id, 0.4 ether, saltS);
    vm.prank(buyer);
    midpoint.reveal(id, 0.8 ether, saltB);

    midpoint.settle(id);

    // Second settle reverts AlreadySettled
    vm.expectRevert(Midpoint.AlreadySettled.selector);
    midpoint.settle(id);
  }

  function test_ReentrantWithdrawBlocked() public {
    ReentrantAttacker attacker = new ReentrantAttacker(midpoint);
    vm.deal(address(attacker), 10 ether);

    vm.prank(seller);
    uint256 id = midpoint.open(
      address(attacker),
      "Attack Test",
      "Terms",
      DEFAULT_CEILING,
      DEFAULT_COMMIT_SECS,
      DEFAULT_REVEAL_SECS
    );

    bytes32 saltS = bytes32(uint256(10));
    bytes32 saltA = bytes32(uint256(20));

    vm.prank(seller);
    midpoint.commit(id, _calcCommitment(id, seller, 0.4 ether, saltS));
    attacker.commit{value: DEFAULT_CEILING}(
      id, _calcCommitment(id, address(attacker), 0.8 ether, saltA)
    );

    vm.prank(seller);
    midpoint.reveal(id, 0.4 ether, saltS);
    attacker.reveal(id, 0.8 ether, saltA);

    midpoint.settle(id);

    // Attacker attempts reentrant withdraw. The reentrant call hits ReentrancyGuard, causing the inner call to revert,
    // which makes the top-level call fail with TransferFailed.
    vm.expectRevert(Midpoint.TransferFailed.selector);
    attacker.attack();
  }

  // --- Fuzz Tests ---

  function testFuzz_TradeRuleMatchesReference(uint128 ask, uint128 bid) public view {
    (bool traded, uint128 price) = midpoint.quotePrice(ask, bid);
    if (bid >= ask) {
      assertTrue(traded);
      uint128 refPrice = uint128((uint256(ask) + uint256(bid)) / 2);
      assertEq(price, refPrice);
      assertTrue(price >= ask);
      assertTrue(price <= bid);
    } else {
      assertFalse(traded);
      assertEq(price, 0);
    }
  }

  function testFuzz_Conservation(uint128 ceiling, uint128 ask, uint128 bid) public {
    vm.assume(ceiling >= 0.01 ether && ceiling <= 100_000 ether);
    vm.assume(ask <= ceiling);
    vm.assume(bid <= ceiling);

    vm.prank(seller);
    uint256 id =
      midpoint.open(buyer, "Fuzz Deal", "Terms", ceiling, DEFAULT_COMMIT_SECS, DEFAULT_REVEAL_SECS);

    bytes32 saltS = bytes32(uint256(11));
    bytes32 saltB = bytes32(uint256(22));

    vm.deal(buyer, uint256(ceiling) + 1 ether);

    vm.prank(seller);
    midpoint.commit(id, _calcCommitment(id, seller, ask, saltS));
    vm.prank(buyer);
    midpoint.commit{value: ceiling}(id, _calcCommitment(id, buyer, bid, saltB));

    vm.prank(seller);
    midpoint.reveal(id, ask, saltS);
    vm.prank(buyer);
    midpoint.reveal(id, bid, saltB);

    uint256 contractBal = address(midpoint).balance;
    assertEq(contractBal, ceiling);

    midpoint.settle(id);

    uint256 pendingSeller = midpoint.pending(seller);
    uint256 pendingBuyer = midpoint.pending(buyer);

    assertEq(pendingSeller + pendingBuyer, ceiling);

    if (bid >= ask) {
      uint128 expectedPrice = uint128((uint256(ask) + uint256(bid)) / 2);
      assertEq(pendingSeller, expectedPrice);
      assertEq(pendingBuyer, ceiling - expectedPrice);
    } else {
      assertEq(pendingSeller, 0);
      assertEq(pendingBuyer, ceiling);
    }

    // Both withdraw
    if (pendingSeller > 0) {
      vm.prank(seller);
      midpoint.withdraw();
    }
    if (pendingBuyer > 0) {
      vm.prank(buyer);
      midpoint.withdraw();
    }

    assertEq(address(midpoint).balance, 0);
  }

  // --- Views pagination check ---

  function test_PaginationAndCommitmentViews() public {
    for (uint256 i = 0; i < 5; i++) {
      vm.prank(seller);
      midpoint.open(
        buyer, "Item", "Terms", DEFAULT_CEILING, DEFAULT_COMMIT_SECS, DEFAULT_REVEAL_SECS
      );
    }

    (uint256[] memory partyIds, uint256 partyTotal) = midpoint.byParty(seller, 0, 10);
    assertEq(partyTotal, 5);
    assertEq(partyIds.length, 5);

    (uint256[] memory latestIds, uint256 latestTotal) = midpoint.latest(0, 3);
    assertEq(latestTotal, 5);
    assertEq(latestIds.length, 3);
    assertEq(latestIds[0], 5);
    assertEq(latestIds[1], 4);
    assertEq(latestIds[2], 3);
  }
}

contract ReentrantAttacker {
  Midpoint public midpoint;
  bool public attacking;

  constructor(Midpoint _midpoint) {
    midpoint = _midpoint;
  }

  function commit(uint256 id, bytes32 c) external payable {
    midpoint.commit{value: msg.value}(id, c);
  }

  function reveal(uint256 id, uint128 price, bytes32 salt) external {
    midpoint.reveal(id, price, salt);
  }

  function attack() external {
    attacking = true;
    midpoint.withdraw();
  }

  receive() external payable {
    if (attacking) {
      midpoint.withdraw();
    }
  }
}
