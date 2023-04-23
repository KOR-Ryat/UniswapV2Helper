// SPDX-License-Identifier: UNLICENSED
// 버전은 0.8.0 이상으로 작성해 주세요.
pragma solidity 0.8.11;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./UniswapV2/common/SafeMath.sol";

import "./UniswapV2/interfaces/IUniswapV2Pair.sol";
import "./UniswapV2/interfaces/IUniswapV2Router.sol";
import "./UniswapV2/interfaces/IERC20.sol";

contract Helper is AccessControl {
    bytes32 public constant ROLE_ADMIN = keccak256("ROLE_ADMIN");

    /* UniswapV2Router 컨트랙트 주소 */
    address router;
    constructor(address router_) {
        _grantRole(ROLE_ADMIN, msg.sender);
        router = router_;
    }

    function getRouter () external view returns (address routerAddress) {
        return router;
    }

    function updateRouter (address router_) external onlyRole(ROLE_ADMIN) {
        router = router_;
    }

    function deactivate (address payable to) external onlyRole(ROLE_ADMIN) {
        selfdestruct(to);
    }

    // Formula without considering fee
    function determineSwapQuantity (uint256 requestedQuantity, uint112 reserveA) public pure returns (uint256 swapQuantity) {
        // Using square root : causing gas issue, floor decimals
        uint256 reserve = uint256(reserveA);
        swapQuantity = Math.sqrt(reserve * requestedQuantity + reserve * reserve) - reserve;
    }

    function determineSwapQuantityV2 (uint256 requestedQuantity, uint112 reserveA) public pure returns (uint256 swapQuantity) {
        /*
            we use only a portion of requested quantity rather than excess it
            usage converges to singleAmount as the fee approaches real value (0.3%)
            but also increase risk of exceed balance in current formula
        */
        uint256 reserve = uint256(reserveA);
        uint256 feePerTenMille = 15;
        swapQuantity = Math.sqrt(reserve * requestedQuantity + reserve * reserve * (20000 - feePerTenMille) * (20000 - feePerTenMille) / (20000 - feePerTenMille * 2) / (20000 - feePerTenMille * 2)) * 10000 / (10000 - feePerTenMille) - (20000 - feePerTenMille) * 10000 * reserve / (20000 - feePerTenMille * 2) / (10000 - feePerTenMille);
    }

    function expectQueries (
        IUniswapV2Pair pair,
        address tokenA,
        uint256 singleAmount
    ) public view returns (
        uint256 swapQuantity,
        uint256 swapOutput,
        uint256 inputQuantity
    ) {

        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        (uint112 reserveA, uint112 reserveB) = pair.token0() == tokenA ? (reserve0, reserve1) : (reserve1, reserve0);

        IUniswapV2Router routerObject = IUniswapV2Router(router);

        swapQuantity = determineSwapQuantityV2(singleAmount, reserveA);
        swapOutput = routerObject.getAmountOut(swapQuantity, reserveA, reserveB);
        inputQuantity = swapQuantity + routerObject.quote(swapOutput, reserveB - uint112(swapOutput), reserveA + uint112(swapQuantity));

        // swapOutput = (reserveB * swapQuantity * 997 / (swapQuantity * 997 + reserveA * 1000));
        // inputQuantity = swapOutput * (uint256(reserveA) + swapQuantity) / (uint256(reserveB) - swapOutput) + swapQuantity;
    }

    /// @notice 유동성 풀에 단일 토큰 예치를 지원하는 함수
    /// @param pair 예치하려는 대상 유동성 풀의 주소
    /// @param tokenA 예치에 사용할 단일 토큰의 주소
    /// @param singleAmount 예치에 사용할 단일 토큰의 예치 수량
    /// @param to LP 토큰을 수령할 사용자의 주소
    /// @param deadline 시간 제한을 둘 블록 타임스탬프
    function singleTokenAddLiquidity(
        IUniswapV2Pair pair,
        address tokenA,
        uint256 singleAmount,
        address to,
        uint256 deadline
    ) external {
        // 함수 구현
        require(block.timestamp < deadline, "The transaction is outdated");

        (
            uint256 swapQuantity,
            uint256 swapOutput,
            uint256 inputQuantity
        ) = expectQueries(pair, tokenA, singleAmount);

        {        
            IERC20 tokenAObject = IERC20(tokenA);
            uint256 currentBalance = tokenAObject.balanceOf(address(this));

            tokenAObject.transferFrom(msg.sender, address(this), inputQuantity);

            require(tokenAObject.balanceOf(address(this)) == currentBalance + inputQuantity, "Token isnt sent properly");
            tokenAObject.approve(router, inputQuantity);
        }

        address tokenB;
        IUniswapV2Router routerObject = IUniswapV2Router(router);
        {
            tokenB = pair.token0() == tokenA ? pair.token1() : pair.token0();
            IERC20 tokenBObject = IERC20(tokenB);

            {
                uint256 balanceB = tokenBObject.balanceOf(address(this));

                address[] memory path = new address[](2);
                path[0] = tokenA;
                path[1] = tokenB;
                
                routerObject.swapExactTokensForTokens(swapQuantity, 0, path, address(this), deadline);

                require(tokenBObject.balanceOf(address(this)) == balanceB + swapOutput, "Somethings wrong while swap");
                tokenBObject.approve(router, swapOutput);
            }
        }

        routerObject.addLiquidity(tokenA, tokenB, inputQuantity - swapQuantity, swapOutput, 0, 0, to, deadline);
    }
}