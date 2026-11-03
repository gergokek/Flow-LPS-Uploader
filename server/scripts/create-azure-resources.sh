#!/usr/bin/env bash
set -euo pipefail

# Execute from an authenticated Azure Cloud Shell session.
# Inputs intentionally have no default subscription or storage name.
: "${AZURE_SUBSCRIPTION_ID:?Set AZURE_SUBSCRIPTION_ID}"
: "${AZURE_RESOURCE_GROUP:?Set AZURE_RESOURCE_GROUP}"
: "${AZURE_STORAGE_NAME:?Set globally unique AZURE_STORAGE_NAME (3-24 lowercase letters/digits)}"
: "${AZURE_FUNCTION_NAME:?Set globally unique AZURE_FUNCTION_NAME}"
: "${AZURE_LOCATION:?Set AZURE_LOCATION to a supported Flex Consumption region}"
: "${AZURE_TENANT_ID:?Set AZURE_TENANT_ID}"
: "${FLOW_API_AUDIENCE:?Set FLOW_API_AUDIENCE after registering the Entra API}"
: "${FLOW_ALLOWED_CALLER_OID:?Set FLOW_ALLOWED_CALLER_OID after identifying authorized approver/tester}"

FLOW_BOARD_ID="5107075373"
FLOW_DRIVE_ID="b!YBiCN3mDjkCA0zlGakoS1F6FNi-WzO5Ip7eBTLppUVCRBefvaJ27TYm2xryC37MY"
case "$AZURE_STORAGE_NAME" in
  *[!a-z0-9]*|'') echo "Invalid storage name" >&2; exit 2;;
esac
if [ "${#AZURE_STORAGE_NAME}" -lt 3 ] || [ "${#AZURE_STORAGE_NAME}" -gt 24 ]; then
  echo "Storage account name must be 3-24 chars" >&2; exit 2
fi
if ! command -v az >/dev/null 2>&1; then echo "Azure CLI is required" >&2; exit 2; fi
az account show --query id -o tsv >/dev/null
az account set --subscription "$AZURE_SUBSCRIPTION_ID"
if [ "$(az account show --query id -o tsv)" != "$AZURE_SUBSCRIPTION_ID" ]; then
  echo "Azure subscription selection failed" >&2; exit 2
fi
echo "Subscription: $AZURE_SUBSCRIPTION_ID"
echo "Resource group: $AZURE_RESOURCE_GROUP"
echo "Region: $AZURE_LOCATION"
echo "Storage: $AZURE_STORAGE_NAME"
echo "Function: $AZURE_FUNCTION_NAME"
printf 'Type CREATE to provision billable Azure resources: '
read -r answer
if [ "$answer" != CREATE ]; then echo "Cancelled"; exit 1; fi

az group create --name "$AZURE_RESOURCE_GROUP" --location "$AZURE_LOCATION" --output none
az storage account create --name "$AZURE_STORAGE_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" --location "$AZURE_LOCATION" \
  --sku Standard_LRS --kind StorageV2 --output none

az functionapp create \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$AZURE_FUNCTION_NAME" \
  --storage-account "$AZURE_STORAGE_NAME" \
  --flexconsumption-location "$AZURE_LOCATION" \
  --runtime node --runtime-version 22 \
  --output none

az functionapp identity assign --name "$AZURE_FUNCTION_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" --output none

az functionapp config appsettings set --name "$AZURE_FUNCTION_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --settings \
   "AZURE_TENANT_ID=$AZURE_TENANT_ID" \
   "FLOW_API_AUDIENCE=$FLOW_API_AUDIENCE" \
   "FLOW_ALLOWED_CALLER_OID=$FLOW_ALLOWED_CALLER_OID" \
   "FLOW_BOARD_ID=$FLOW_BOARD_ID" \
   "FLOW_DRIVE_ID=$FLOW_DRIVE_ID" \
  --output none

principal_id=$(az functionapp identity show --name "$AZURE_FUNCTION_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" --query principalId -o tsv)
echo "Created Azure Function: $AZURE_FUNCTION_NAME"
echo "Managed Identity object ID: $principal_id"
echo "NEXT: grant Microsoft Graph application Sites.Selected and Hanoflow site Read"
echo "NEXT: expose Draft.Verify Entra delegated API scope for uploader SPA"
echo "NEXT: deploy the server/ directory, then verify authenticated endpoint."
echo "NOTICE: the endpoint is intentionally fail-closed until Graph permissions are granted."
