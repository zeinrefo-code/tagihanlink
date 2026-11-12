# Aevum Starter Kit. Run `make help` for the list.
SHELL := /bin/bash
.DEFAULT_GOAL := help

AEVUM_RPC   ?= https://rpc-test.qday.info
LOCAL_RPC   ?= http://127.0.0.1:8545
TUSD8       := 0x456569838f1d43009A91ebA4263147Afd7233483
# tUSD8's master minter. Only used on a local fork, where anyone can impersonate it.
TUSD8_MM    := 0x4d4b7031D35B74215bebe33F6AF6e682Ea99d0b1
# anvil's first default account (public test account, local chains only).
ANVIL_0     := 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
AMOUNT      ?= 100

.PHONY: help install build test test-fork check anvil fork deploy-local deploy-fork deploy-aevum mint deal dev

help: ## Show this list
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36mmake %-14s\033[0m %s\n", $$1, $$2}'

install: ## Fetch Solidity libs and JS packages
	git submodule update --init --recursive
	pnpm install

build: ## Compile contracts and check they are Shanghai-safe
	cd contracts && forge build
	node tools/check-shanghai.mjs contracts/out

test: ## Unit tests (local, no network)
	cd contracts && forge test --no-match-path 'test/fork/*' -vv

test-fork: ## Tests against the real tUSD8 on a local fork of Aevum (no funds needed)
	cd contracts && forge test --match-path 'test/fork/*' --fork-url $(AEVUM_RPC) -vv

check: build test test-fork ## Everything CI runs
	pnpm -r typecheck

anvil: ## Empty local chain (31337) with Aevum's EVM rules
	anvil --hardfork shanghai

fork: ## Local copy of Aevum testnet (44005) on 127.0.0.1:8545
	anvil --fork-url $(AEVUM_RPC) --hardfork shanghai

deploy-local: ## Deploy MockUSD8 + Checkout to `make anvil`
	cd contracts && forge script script/Deploy.s.sol --rpc-url $(LOCAL_RPC) --broadcast --unlocked --sender $(ANVIL_0)

deploy-fork: ## Deploy Checkout (real tUSD8) to `make fork`
	cd contracts && forge script script/Deploy.s.sol --rpc-url $(LOCAL_RPC) --broadcast --unlocked --sender $(ANVIL_0)

deploy-aevum: ## Deploy Checkout to Aevum testnet. Needs ACCOUNT=<keystore name> (see README)
	@test -n "$(ACCOUNT)" || (echo "Set ACCOUNT=<name>. Create one with: cast wallet import <name> --interactive" && exit 1)
	cd contracts && forge script script/Deploy.s.sol --rpc-url $(AEVUM_RPC) --broadcast --legacy --account $(ACCOUNT)

mint: ## `make anvil` only: mint AMOUNT MockUSD8 to TO. Needs CHECKOUT=<address>
	@test -n "$(TO)" -a -n "$(CHECKOUT)" || (echo "Usage: make mint TO=0x... CHECKOUT=0x... [AMOUNT=100]" && exit 1)
	cast send $$(cast call $(CHECKOUT) "token()(address)" --rpc-url $(LOCAL_RPC)) "mint(address,uint256)" $(TO) $$(( $(AMOUNT) * 1000000 )) \
	  --rpc-url $(LOCAL_RPC) --unlocked --from $(ANVIL_0) > /dev/null
	@echo "Minted $(AMOUNT) to $(TO)."

deal: ## `make fork` only: give TO AMOUNT tUSD8 and 10 tQDAY for gas
	@test -n "$(TO)" || (echo "Usage: make deal TO=0x... [AMOUNT=100]" && exit 1)
	@test "$$(cast chain-id --rpc-url $(LOCAL_RPC))" = "44005" || (echo "This only works on 'make fork'." && exit 1)
	@cast rpc anvil_setBalance $(TO) 0x8ac7230489e80000 --rpc-url $(LOCAL_RPC) > /dev/null
	@cast rpc anvil_impersonateAccount $(TUSD8_MM) --rpc-url $(LOCAL_RPC) > /dev/null
	@cast rpc anvil_setBalance $(TUSD8_MM) 0x56BC75E2D63100000 --rpc-url $(LOCAL_RPC) > /dev/null
	@cast send $(TUSD8) "configureMinter(address,uint256)" $(TUSD8_MM) 1000000000000000 --from $(TUSD8_MM) --unlocked --rpc-url $(LOCAL_RPC) > /dev/null
	@cast send $(TUSD8) "mint(address,uint256)" $(TO) $$(( $(AMOUNT) * 1000000 )) --from $(TUSD8_MM) --unlocked --rpc-url $(LOCAL_RPC) > /dev/null
	@echo "tUSD8 balance of $(TO): $$(cast call $(TUSD8) 'balanceOf(address)(uint256)' $(TO) --rpc-url $(LOCAL_RPC))"

dev: ## Start the web app on http://localhost:3000
	pnpm dev
