// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/**
 * @title Midpoint
 * @notice A sealed two-sided price discovery mechanism for buyer and seller.
 * @dev Settles trades at the floor midpoint between seller's ask and buyer's bid if bid >= ask.
 *      The buyer escrows the full ceiling up front when committing to guarantee payment.
 *      Pull payment pattern is used for all withdrawals.
 */
contract Midpoint {
  // --- Constants ---
  uint256 public constant MAX_TITLE_BYTES = 64;
  uint256 public constant MAX_TERMS_BYTES = 300;
  uint128 public constant MIN_CEILING = 0.01 ether;
  uint128 public constant MAX_CEILING = 100_000 ether;
  uint64 public constant MIN_WINDOW = 1 hours;
  uint64 public constant MAX_WINDOW = 7 days;
  uint256 public constant MAX_PAGE = 50;

  // --- Types ---
  enum State {
    Open,
    Revealing,
    Settled,
    Void
  }

  // Struct packing saves slots:
  // Slot 0: seller (20 bytes), state (1 byte), askRevealed (1 byte), bidRevealed (1 byte)
  // Slot 1: buyer (20 bytes), revealSecs (4 bytes), termsBlock (4 bytes)
  // Slot 2: commitBy (8 bytes), revealBy (8 bytes), ceiling (16 bytes)
  // Slot 3: sellerCommit (32 bytes)
  // Slot 4: buyerCommit (32 bytes)
  // Slot 5: ask (16 bytes), bid (16 bytes)
  // Slot 6: price (16 bytes)
  // Slot 7: title string
  struct Deal {
    address seller;
    address buyer;
    State state;
    uint64 commitBy;
    uint64 revealBy;
    uint32 revealSecs;
    uint32 termsBlock;
    uint128 ceiling;
    bytes32 sellerCommit;
    bytes32 buyerCommit;
    uint128 ask;
    uint128 bid;
    bool askRevealed;
    bool bidRevealed;
    uint128 price;
    string title;
  }

  // --- Storage ---
  uint256 private _status; // Reentrancy guard
  uint256 public dealCount;
  mapping(uint256 => Deal) private _deals;
  mapping(address => uint256[]) private _byParty;
  mapping(address => uint256) public pending;

  // --- Events ---
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

  // --- Errors ---
  error BadBuyer();
  error BadText();
  error BadParams();
  error NotFound();
  error CommitClosed();
  error NotAParty();
  error AlreadyCommitted();
  error ZeroCommitment();
  error WrongPayment(uint256 expected);
  error RevealClosed();
  error AlreadyRevealed();
  error BadReveal();
  error AboveCeiling(uint128 ceiling);
  error BuyerCommitted();
  error NotSeller();
  error NotSettleable();
  error AlreadySettled();
  error NothingToWithdraw();
  error TransferFailed();
  error ReentrancyGuard();

  // --- Modifiers ---
  modifier nonReentrant() {
    if (_status == 2) revert ReentrancyGuard();
    _status = 2;
    _;
    _status = 1;
  }

  constructor() {
    _status = 1;
  }

  // --- External Functions ---

  /**
   * @notice Open a new midpoint deal with a buyer, terms, and ceiling.
   * @param buyer Designated counterparty.
   * @param title Deal summary title.
   * @param terms Deal terms string (emitted in Opened event).
   * @param ceiling Maximum allowable trade price and required buyer escrow.
   * @param commitSecs Duration in seconds from now until commit closes.
   * @param revealSecs Duration in seconds from when both commit until reveal closes.
   */
  function open(
    address buyer,
    string calldata title,
    string calldata terms,
    uint128 ceiling,
    uint64 commitSecs,
    uint32 revealSecs
  ) external returns (uint256 id) {
    if (buyer == address(0) || buyer == msg.sender) revert BadBuyer();
    if (
      bytes(title).length == 0 || bytes(title).length > MAX_TITLE_BYTES
        || bytes(terms).length > MAX_TERMS_BYTES
    ) {
      revert BadText();
    }
    if (
      ceiling < MIN_CEILING || ceiling > MAX_CEILING || commitSecs < MIN_WINDOW
        || commitSecs > MAX_WINDOW || revealSecs < MIN_WINDOW || revealSecs > MAX_WINDOW
    ) {
      revert BadParams();
    }

    unchecked {
      id = ++dealCount;
    }

    Deal storage d = _deals[id];
    d.seller = msg.sender;
    d.buyer = buyer;
    d.state = State.Open;
    d.commitBy = uint64(block.timestamp) + commitSecs;
    d.revealSecs = revealSecs;
    d.termsBlock = uint32(block.number);
    d.ceiling = ceiling;
    d.title = title;

    _byParty[msg.sender].push(id);
    _byParty[buyer].push(id);

    emit Opened(id, msg.sender, buyer, title, terms, ceiling, d.commitBy, revealSecs);
  }

  /**
   * @notice Commit a sealed price hash.
   * @param id Deal identifier.
   * @param commitment keccak256(abi.encode(id, msg.sender, price, salt)).
   */
  function commit(uint256 id, bytes32 commitment) external payable {
    if (id == 0 || id > dealCount) revert NotFound();
    Deal storage d = _deals[id];
    if (d.state != State.Open) revert CommitClosed();
    if (block.timestamp >= d.commitBy) revert CommitClosed();
    if (commitment == bytes32(0)) revert ZeroCommitment();

    bool isSeller = msg.sender == d.seller;
    bool isBuyer = msg.sender == d.buyer;
    if (!isSeller && !isBuyer) revert NotAParty();

    if (isSeller) {
      if (d.sellerCommit != bytes32(0)) revert AlreadyCommitted();
      if (msg.value != 0) revert WrongPayment(0);
      d.sellerCommit = commitment;
    } else {
      if (d.buyerCommit != bytes32(0)) revert AlreadyCommitted();
      if (msg.value != d.ceiling) revert WrongPayment(d.ceiling);
      d.buyerCommit = commitment;
    }

    bool bothIn = (d.sellerCommit != bytes32(0) && d.buyerCommit != bytes32(0));
    if (bothIn) {
      d.state = State.Revealing;
      d.revealBy = uint64(block.timestamp) + d.revealSecs;
    }

    emit Committed(id, msg.sender, bothIn);
  }

  /**
   * @notice Reveal a committed price and salt.
   * @param id Deal identifier.
   * @param price Sealed price.
   * @param salt Secret salt.
   */
  function reveal(uint256 id, uint128 price, bytes32 salt) external {
    if (id == 0 || id > dealCount) revert NotFound();
    Deal storage d = _deals[id];
    if (d.state != State.Revealing) revert RevealClosed();
    if (block.timestamp > d.revealBy) revert RevealClosed();

    bool isSeller = msg.sender == d.seller;
    bool isBuyer = msg.sender == d.buyer;
    if (!isSeller && !isBuyer) revert NotAParty();

    bytes32 expected = isSeller ? d.sellerCommit : d.buyerCommit;
    bool already = isSeller ? d.askRevealed : d.bidRevealed;
    if (already) revert AlreadyRevealed();

    if (keccak256(abi.encode(id, msg.sender, price, salt)) != expected) {
      revert BadReveal();
    }

    if (isBuyer && price > d.ceiling) {
      revert AboveCeiling(d.ceiling);
    }

    if (isSeller) {
      d.ask = price;
      d.askRevealed = true;
    } else {
      d.bid = price;
      d.bidRevealed = true;
    }

    emit Revealed(id, msg.sender, price);
  }

  /**
   * @notice Settle a deal once both revealed, or upon window expiry.
   * @param id Deal identifier.
   */
  function settle(uint256 id) external {
    if (id == 0 || id > dealCount) revert NotFound();
    Deal storage d = _deals[id];

    if (d.state == State.Settled || d.state == State.Void) revert AlreadySettled();

    if (d.state == State.Open) {
      if (block.timestamp < d.commitBy) revert NotSettleable();
      // Commit window expired before both committed
      d.state = State.Void;
      if (d.buyerCommit != bytes32(0)) {
        pending[d.buyer] += d.ceiling;
      }
      emit Settled(id, 0, false);
      return;
    }

    if (d.state == State.Revealing) {
      bool bothRevealed = d.askRevealed && d.bidRevealed;
      bool windowExpired = block.timestamp > d.revealBy;
      if (!bothRevealed && !windowExpired) revert NotSettleable();

      if (bothRevealed && d.bid >= d.ask) {
        uint128 tradePrice = uint128((uint256(d.ask) + uint256(d.bid)) / 2);
        d.price = tradePrice;
        d.state = State.Settled;
        pending[d.seller] += tradePrice;
        pending[d.buyer] += (d.ceiling - tradePrice);
        emit Settled(id, tradePrice, true);
      } else {
        d.state = State.Void;
        // Refund buyer ceiling since buyer committed to enter Revealing state
        pending[d.buyer] += d.ceiling;
        emit Settled(id, 0, false);
      }
      return;
    }

    revert NotSettleable();
  }

  /**
   * @notice Cancel an open deal before the buyer has committed. Seller only.
   * @param id Deal identifier.
   */
  function cancel(uint256 id) external {
    if (id == 0 || id > dealCount) revert NotFound();
    Deal storage d = _deals[id];
    if (msg.sender != d.seller) revert NotSeller();
    if (d.state != State.Open) revert CommitClosed();
    if (d.buyerCommit != bytes32(0)) revert BuyerCommitted();

    d.state = State.Void;
    emit Cancelled(id);
  }

  /**
   * @notice Pull payment: withdraw accrued pending balance.
   */
  function withdraw() external nonReentrant {
    uint256 amount = pending[msg.sender];
    if (amount == 0) revert NothingToWithdraw();

    pending[msg.sender] = 0;

    (bool ok,) = msg.sender.call{value: amount}("");
    if (!ok) revert TransferFailed();

    emit Withdrawn(msg.sender, amount);
  }

  // --- Views ---

  function dealOf(uint256 id) external view returns (Deal memory) {
    if (id == 0 || id > dealCount) revert NotFound();
    return _deals[id];
  }

  function commitmentOf(uint256 id, address who) external view returns (bytes32) {
    if (id == 0 || id > dealCount) revert NotFound();
    Deal storage d = _deals[id];
    if (who == d.seller) return d.sellerCommit;
    if (who == d.buyer) return d.buyerCommit;
    return bytes32(0);
  }

  function quotePrice(uint128 ask, uint128 bid) external pure returns (bool traded, uint128 price) {
    if (bid >= ask) {
      return (true, uint128((uint256(ask) + uint256(bid)) / 2));
    }
    return (false, 0);
  }

  function byParty(address addr, uint256 offset, uint256 count)
    external
    view
    returns (uint256[] memory ids, uint256 total)
  {
    uint256[] storage partyDeals = _byParty[addr];
    total = partyDeals.length;
    if (offset >= total || count == 0) {
      return (new uint256[](0), total);
    }
    if (count > MAX_PAGE) {
      count = MAX_PAGE;
    }
    if (offset + count > total) {
      count = total - offset;
    }

    ids = new uint256[](count);
    for (uint256 i = 0; i < count;) {
      ids[i] = partyDeals[offset + i];
      unchecked {
        ++i;
      }
    }
  }

  function latest(uint256 offset, uint256 count)
    external
    view
    returns (uint256[] memory ids, uint256 total)
  {
    total = dealCount;
    if (offset >= total || count == 0) {
      return (new uint256[](0), total);
    }
    if (count > MAX_PAGE) {
      count = MAX_PAGE;
    }
    if (offset + count > total) {
      count = total - offset;
    }

    ids = new uint256[](count);
    for (uint256 i = 0; i < count;) {
      // Latest first: total - offset - 1 - i + 1 = total - offset - i
      ids[i] = total - offset - i;
      unchecked {
        ++i;
      }
    }
  }
}
