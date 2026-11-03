# Flow LPS server-side content verifier (not yet deployed)

This is a separate Azure Functions Node.js v4 app. It is **not** part of the GitHub Pages Vite bundle. No Azure resources are provisioned by this repository and the client currently does not call this endpoint.

## Security model

- `POST /api/draft/verify-content` validates a Microsoft Entra **v2 delegated access token** with signed JWKS, issuer, exact audience, tenant, `Draft.Verify` scope and an explicit caller object-ID allowlist.
- The Function accesses Microsoft Graph using **Managed Identity** application permissions (not the user's Graph token). Configure Microsoft Graph `Sites.Selected` **application** permission on the Function managed identity and grant `Read` on the Hanoflow site separately. Delegated permissions previously granted to the Uploader's SPA are **not** sufficient.
- Configure `AZURE_TENANT_ID`, `FLOW_API_AUDIENCE`, `FLOW_ALLOWED_CALLER_OID`, `FLOW_BOARD_ID` and `FLOW_DRIVE_ID` in Function App settings. Never commit values or credentials. `FLOW_API_AUDIENCE` must match the API's exposed application ID URI/audience, not the SPA's Graph audience.
- Restrict Function App inbound origins via Azure CORS to the uploader origin. Configure authentication/authorization and appropriate network exposure for your deployment. CORS is not an authorization mechanism.
- This function **only reads** SharePoint data. It returns SHA-256 and stable eTag checks with `eligibleForApproval:false`; there are no Monday writes, approval actions or SharePoint writes.
- The review request is uploaded by the caller and is not itself an authorization or signed approval. A successful SHA-256 comparison proves that the storage content matches the given request; independent approval authorization, live Monday conflict checks and a trusted attestation record remain separate requirements.
- Graph `/content` returns an HTTP redirect to a short-lived preauthenticated URL. The server follows it with **no Authorization header**, checks length/SHA-256, and rechecks the item eTag. No download URL or Graph token leaves the server.

## Deployment prerequisite

1. Create Entra API app registration and expose `Draft.Verify` delegated scope, authorize the Uploader SPA to request it, and provision caller allowlist.
2. Create a separate Azure Function App (Node 22 or 24), enable system-assigned Managed Identity, grant Graph application `Sites.Selected` plus per-site Read.
3. Set the five environment settings above and configure allowed SPA origin.
4. Install dependencies from this `server/` directory, deploy the directory as an Azure Function, and test a POST with an actual API-scoped access token.
5. Only after that, configure the Uploader's endpoint URL and build its UI client. Never embed a Function key or client secret in the static website.

Run `npm test` under `server/`. Browser-based access is not a production test of this server; the Azure-hosted identity, site grant and API token must be verified after provisioning.
