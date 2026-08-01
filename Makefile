PNPM ?= pnpm
DIST := dist

# UTF-8 byte sequences for U+2010..U+2015 (hyphen, non-breaking hyphen, figure
# dash, en dash, em dash, horizontal bar) and U+2212 (minus sign). Matching raw
# bytes under LC_ALL=C keeps the check locale independent and keeps the literal
# characters out of this file.
DASH_BYTES := \xe2\x80[\x90-\x95]|\xe2\x88\x92
DASH_PATHS := src tests public README.md AGENTS.md Makefile

# Files every production build must produce.
REQUIRED_ARTIFACTS := \
	$(DIST)/index.html \
	$(DIST)/404.html \
	$(DIST)/about/index.html \
	$(DIST)/topics/index.html \
	$(DIST)/rss.xml \
	$(DIST)/sitemap-index.xml \
	$(DIST)/social-card.png

.DEFAULT_GOAL := help
.PHONY: help install dev format lint lint-dashes lint-format types build validate check test clean

help: ## Show the available targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN { FS = ":.*?## " } { printf "%-14s %s\n", $$1, $$2 }'

install: ## Install dependencies from the lockfile
	$(PNPM) install --frozen-lockfile

dev: ## Start the development server
	$(PNPM) dev

format: ## Rewrite files with Prettier
	$(PNPM) format

lint-format: ## Verify Prettier formatting without rewriting files
	$(PNPM) format:check

lint-dashes: ## Fail if an em dash or en dash appears anywhere in the sources
	@matches=$$(LC_ALL=C grep -rnIP \
		--exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git \
		'$(DASH_BYTES)' $(DASH_PATHS) 2>/dev/null || true); \
	if [ -n "$$matches" ]; then \
		echo "Found an em dash, en dash, or related character:"; \
		echo "$$matches"; \
		echo; \
		echo "Use a hyphen, comma, colon, or period instead. See AGENTS.md."; \
		exit 1; \
	fi
	@echo "lint-dashes: no em dashes or en dashes found"

lint: lint-format lint-dashes ## Run every lint check

types: ## Check Astro components and content frontmatter
	$(PNPM) check

build: ## Build the production site into dist/
	$(PNPM) build

validate: ## Confirm the build produced the expected output
	@missing=0; \
	for artifact in $(REQUIRED_ARTIFACTS); do \
		if [ ! -s "$$artifact" ]; then \
			echo "missing or empty: $$artifact"; \
			missing=1; \
		fi; \
	done; \
	if [ "$$missing" -ne 0 ]; then \
		echo "validate: run 'make build' first"; \
		exit 1; \
	fi
	@if ! grep -q '<rss' $(DIST)/rss.xml; then \
		echo "validate: rss.xml is not a feed"; \
		exit 1; \
	fi
	@if ! grep -q '<sitemapindex' $(DIST)/sitemap-index.xml; then \
		echo "validate: sitemap-index.xml is not a sitemap index"; \
		exit 1; \
	fi
	@if [ -z "$$(find $(DIST)/blog -mindepth 1 -maxdepth 1 -type d)" ]; then \
		echo "validate: no posts were built"; \
		exit 1; \
	fi
	@if grep -rlq 'astro:content-layer-deferred-module' $(DIST); then \
		echo "validate: dist contains unresolved content modules"; \
		exit 1; \
	fi
	@echo "validate: build output looks good"

check: lint types build validate ## Required before pushing: lint, types, build, validate

test: build ## Run the Playwright smoke and accessibility tests
	$(PNPM) exec playwright test

clean: ## Remove build output and test artifacts
	rm -rf $(DIST) .astro test-results playwright-report
