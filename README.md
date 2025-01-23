> Overview

+ 유니스왑 V2를 사용할 때 풀의 한쪽 토큰만 가지고 있어도 그 일부를 반대편 토큰으로 스왑하여 유동성을 공급할 수 있게 하는 편의성 컨트랙
+ 사용스택 : node 18, solidity, hardhat
+ 테스트 : ```npx hardhat test```

> determineSwapQuantity

본 컨트랙의 가장 주요한 부분은 최초 가지고 있는 토큰 A 중에서 몇개를 토큰 B로 스왑하여야 잔액 없이 유동성 공급을 최대로 할 수 있는가?라고 생각했습니다.

이 함수는 그 스왑할 개수 Input_A 를 결정하는 함수로, 최초 유저가 가지고 있는 토큰 A의 개수 Requested_A 와 스왑 풀 내에 존재하는 토큰 A의 리저브 Reserve_A 를 인자로 합니다.

유니스왑 V2 CFMM 근간인 ab=k로부터, Input_A 개의 토큰 A를 스왑하면 결과로 받게될 토큰 B의 개수 Output_B 는 다음과 같이 계산할 수 있습니다.

+ Reserve_A * Reserve_B = k = (Reserve_A + Input_A) * (Reserve_B - Output_B)

또한 남은 토큰 A와 이 결과로 받게된 토큰 B의 비율이 스왑 후 풀의 비율 같을 때 최대 유동성 공급이 가능하므로 다음 조건식을 생각할 수 있습니다.

+ (Requested_A - Input_A) : Output_B = (Reserve_A + Input_A) : (Reserve_B - Output_B)

위 두가지 식을 연립하면 Reserve_B 및 Output_B는 소거되고, 다음과 같이 최적의 Input_A 값을 계산하는 공식을 얻을 수 있습니다.

+ Input_A = sqrt(Reserve_A * (requested_A + Reserve_A)) - Reserve_A

> determineSwapQuantityV2

위 식은 수수료가 없는 이상적인 경우에 대한 것이고, 유니스왑 V2에서는 스왑시 투입한 토큰 A에 대해 일정량을 수수료로 가져갑니다. 따라서 위의 각 식에서 Input_A 대신 Input_A * (1-feeRate) 을 넣어야 정확하게 계산이 가능합니다. 

컨트랙에서는 만분율로 수수료를 설정하고 있기 때문에, Input_A 대신 Input_A * (10000 - feePerTenMille) / 10000 를 사용했으며 결과로 Helper.sol 50번째 행의 수식이 되었습니다.
