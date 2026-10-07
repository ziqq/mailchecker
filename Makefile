SHELL   :=/bin/bash -e -o pipefail
VERSION :=$(shell node -p "require('./src/manifest.json').version")

.DEFAULT_GOAL := all
.PHONY: all get build check test lint typecheck package verify audit clean help version
all: get verify ## Install tools and verify

help: ## Help dialog
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-14s\033[0m %s\n", $$1, $$2}'

version: ## Print the extension version
	@echo $(VERSION)

get: ## Install locked development tools
	@npm ci

build: ## Bundle src/ into build/
	@npm run build

lint: ## ESLint
	@npm run lint

typecheck: ## TypeScript checks
	@npm run typecheck

test: ## Regression tests
	@npm test

check: ## Format, lint, types, tests and repository checks
	@npm run check

package: ## Build the reproducible ZIP into dist/
	@npm run package

verify: ## All checks and the ZIP
	@npm run verify

audit: ## Audit development dependencies
	@npm audit --audit-level=high

clean: ## Remove build output
	@rm -rf build dist scripts/__pycache__
