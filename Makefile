# Deploy platform-services to AKS from your machine. See README "Deployment".
# Needs kubectl (context set to the cluster) and envsubst (GNU gettext).
# Works with the GNU Make 3.81 that ships with macOS.

# =========== #
#  Interface  #
# =========== #

PURPLE      := $(shell tput -Txterm setab 5 && tput -Txterm setaf 7)
RESET       := $(shell tput -Txterm sgr0)
YELLOW_TEXT := $(shell tput -Txterm setaf 3)
RED_TEXT    := $(shell tput -Txterm setaf 1)
GREEN_TEXT  := $(shell tput -Txterm setaf 2)

# ================== #
#  Environment Vars  #
# ================== #

# Real resource names, gitignored. Copy manifests/.env.example; plain KEY=value lines, no quotes.
ENV_FILE := manifests/.env
-include $(ENV_FILE)

MANIFEST_VARS := AZURE_ACR_NAME POSTGRES_SERVER ARTIFACT_STORAGE_ACCOUNT_URL ARTIFACT_STORAGE_CONTAINER
export $(MANIFEST_VARS)

# envsubst replaces only these variables, never anything else that looks like ${...}.
SUBST  := envsubst '$(foreach v,$(MANIFEST_VARS),$$$(v))'
RENDER := cat manifests/deployment.yaml manifests/service.yaml | $(SUBST)

NAMESPACE  := platform
DEPLOYMENT := deployment/platform-services

.PHONY: help check-env render diff deploy restart status logs readyz

# ========= #
#  Scripts  #
# ========= #

# Default target: list targets rather than deploy by accident.
help:
	@echo "make render   Print the manifests with $(ENV_FILE) substituted"
	@echo "make diff     Compare the rendered manifests with the cluster"
	@echo "make deploy   Apply the manifests and wait for the rollout"
	@echo "make restart  Pull the latest image and wait for the rollout"
	@echo "make status   Show the pods"
	@echo "make logs     Show the latest logs"
	@echo "make readyz   Print the readiness report from inside the pod"

check-env:
	@test -f $(ENV_FILE) || { echo "$(RED_TEXT)Missing $(ENV_FILE): copy manifests/.env.example and fill it in$(RESET)"; exit 1; }
	@$(foreach v,$(MANIFEST_VARS),test -n "$($(v))" || { echo "$(RED_TEXT)$(v) is empty in $(ENV_FILE)$(RESET)"; exit 1; };)
	@echo "$(GREEN_TEXT)$(ENV_FILE) okay$(RESET)" >&2

render: check-env
	@$(RENDER)

# kubectl diff exits 1 when there are differences; only greater exit codes are failures.
diff: check-env
	@$(RENDER) | kubectl diff -f - || test $$? -eq 1

deploy: check-env
	@echo ""
	@echo "$(PURPLE) platform-services $(RESET) $(YELLOW_TEXT)kubectl apply -f manifests/ (context: $$(kubectl config current-context))$(RESET)"
	@$(RENDER) | kubectl apply -f -
	kubectl rollout status $(DEPLOYMENT) -n $(NAMESPACE)

# The Deployment pulls :latest with imagePullPolicy Always, so a restart picks up a newly published image.
restart:
	@echo ""
	@echo "$(PURPLE) platform-services $(RESET) $(YELLOW_TEXT)kubectl rollout restart (context: $$(kubectl config current-context))$(RESET)"
	kubectl rollout restart $(DEPLOYMENT) -n $(NAMESPACE)
	kubectl rollout status $(DEPLOYMENT) -n $(NAMESPACE)

status:
	kubectl get pods -n $(NAMESPACE) -l app.kubernetes.io/name=platform-services

logs:
	kubectl logs -n $(NAMESPACE) $(DEPLOYMENT) --tail=100

readyz:
	@kubectl exec -n $(NAMESPACE) $(DEPLOYMENT) -- node -e "fetch('http://localhost:3000/readyz').then(r => r.text()).then(console.log)"
