DEV_IMAGE = browser-community-dev
KIND_NODE ?= kind-control-plane
ODIGLET_BROWSER_PATH ?= /var/odigos/browser

.PHONY: build
build: ## Build the agent bundle locally into dist/agent.js
	npm install
	npm run build

.PHONY: typecheck
typecheck: ## Type-check the agent sources
	npm install
	npm run typecheck

.PHONY: clean
clean:
	rm -rf dist node_modules

##################################################
# Dev: build release image and deploy to a Kind cluster
##################################################

.PHONY: deploy-dev
deploy-dev: ## Build the release image and copy the bundle into the kind node's /var/odigos/browser
	@echo "📦 Building release image..."
	@docker build -f release.Dockerfile -t $(DEV_IMAGE) .
	@echo "📤 Extracting instrumentations from image..."
	@CID=$$(docker create $(DEV_IMAGE) true 2>/dev/null || docker create $(DEV_IMAGE)); \
	docker cp $$CID:/instrumentations/browser - | \
		docker exec -i $(KIND_NODE) sh -c 'rm -rf $(ODIGLET_BROWSER_PATH) && mkdir -p $(ODIGLET_BROWSER_PATH) && tar xf - -C $(ODIGLET_BROWSER_PATH) --strip-components=1'; \
	docker rm $$CID > /dev/null 2>&1
	@echo "✅ Browser instrumentation deployed to $(KIND_NODE):$(ODIGLET_BROWSER_PATH)"
	@docker exec $(KIND_NODE) ls -la $(ODIGLET_BROWSER_PATH)
