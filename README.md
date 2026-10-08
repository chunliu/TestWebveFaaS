# TestWebveFaaS — BytePlus container deployment

An Express website prepared for **BytePlus veFaaS Web applications** in **Johor (`ap-southeast-1`)**, using **Code Pipeline** and **Container Registry (CR)**.

Fork: <https://github.com/chunliu/TestWebveFaaS>

Upstream: <https://github.com/chongado/TestWebveFaaS>

The application serves the existing website and exposes:

```json
GET /health
{"status":"ok","service":"byteplus-ai-ecosystem-site"}
```

## Local development and tests

Use Node.js 20 to match the container image. The base image is retained from upstream; this change does not upgrade Node.js or application dependencies.

```sh
npm ci --omit=dev
npm test
npm start
```

Open <http://localhost:3000>. The listener binds to `0.0.0.0` and selects its port in this order:

1. `_FAAS_RUNTIME_PORT`, supplied by veFaaS.
2. `PORT`, for ordinary container or local use.
3. `3000`, the local development default.

Invalid ports fail immediately. `SIGINT` and `SIGTERM` stop the HTTP server gracefully, with a 10-second shutdown deadline.

## Build and verify the container locally

The Dockerfile runs `npm test` during the build. Failed tests prevent a new image from being built. The final image contains production dependencies and website files; build-time tests and tooling are excluded.

```sh
docker build --platform=linux/amd64 -t testweb-vefaas:local .
docker run --rm --platform=linux/amd64 \
  -p 127.0.0.1:8000:8000 testweb-vefaas:local
```

In another terminal:

```sh
npm run check-site -- http://127.0.0.1:8000
```

The check validates the exact `/health` JSON, the home page, and the content and content types of `/styles.css` and `/app.js`. It retries the health check while the service starts. Use a root URL without a path prefix.

The image starts through `/opt/application/run.sh`, defaults to `PORT=8000`, and uses `USER node` for ordinary Docker execution. BytePlus's image deployment documentation states that veFaaS currently runs custom images as root regardless of the Dockerfile's `USER` setting. The application does not rely on a particular UID.

## Prepare cloud resources

Create these resources yourself in the BytePlus console. The templates contain placeholders and do not provision infrastructure.

| Resource | Configuration |
| --- | --- |
| Container Registry | An instance in Johor |
| CR namespace | `demo`, or your chosen namespace |
| CR repository | Private OCI repository `testweb-vefaas` |
| Code Pipeline | A workspace and GitHub service connection for this fork |
| veFaaS | A CPU-based Web application using a container image |
| API Gateway | A gateway in Johor providing the website endpoint |

Configure Code Pipeline's CR access and veFaaS's private-image pull authorization using the console. Keep credentials in service connections or the platform's secret settings, not in Git.

## First deployment: build the initial image

Use [`deploy/code-pipeline.bootstrap.yaml`](deploy/code-pipeline.bootstrap.yaml). This pipeline builds, tests, and pushes an image, without releasing a function.

1. In Code Pipeline, select a workspace and choose **Create pipeline → YAML editing**.
2. Paste the bootstrap YAML and replace:

   | Placeholder | Required value |
   | --- | --- |
   | `REPLACE_WITH_GITHUB_SERVICE_CONNECTION_ID` | The GitHub service connection ID from Code Pipeline |
   | `REPLACE_WITH_CR_INSTANCE_ID` | The target Johor CR instance ID |

3. Update `namespace` and `repo` if you chose different names. The sample uses the documented public build pool `public/prod-v2-public`; select an available pool if your workspace uses another one.
4. Click **Validation** in the YAML editor, resolve any workspace-specific requirements, save, and run manually.
5. Confirm the image exists in CR, and record its full address and tag from the `imageOutput_build-image` output.

`$(DATETIME)` is a Code Pipeline preset variable, not a shell command. The pipeline builds `linux/amd64` images and uses unique tags. The Dockerfile installs dependencies and runs tests; no additional NodeJS compilation task is required.

## Create the function and gateway

Create a veFaaS Web application using the initial image:

| Function setting | Value |
| --- | --- |
| Region | Johor — `ap-southeast-1` |
| Suggested name | `testweb-vefaas` |
| Instance type | CPU |
| Deployment method | Container image |
| Image | The full image address from the bootstrap run |
| Startup command | `/opt/application/run.sh` |
| Listening port | `8000` |
| Environment | `NODE_ENV=production`, `PORT=8000` |
| Initial resources | For validation, 1 vCPU / 1 GiB if available in the console |
| Logging | Enabled |

Release the function, confirm success, and record its **Function ID**. Configure an API Gateway trigger with:

- Prefix matching at `/`, covering all website assets and `/health`.
- `GET` and `HEAD` allowed.
- Original request paths preserved, with the website at the domain root.
- A public HTTPS endpoint; for this simple website, initially leave the route's custom timeout switch disabled.

Validate the endpoint:

```sh
npm run check-site -- https://YOUR_GATEWAY_DOMAIN
```

Also open the website in a browser and check its navigation and interactive elements.

## Subsequent releases: build and publish automatically

Use [`deploy/code-pipeline.yaml`](deploy/code-pipeline.yaml), replacing the two build placeholders and `REPLACE_WITH_VEFAAS_FUNCTION_ID` with the function's actual ID. You can update the bootstrap pipeline's YAML to this full configuration after creating the function.

The deployment task uses:

- Component `faas-deploy@1.0.0`.
- `functionVersion: "0"` for the latest/new version, rather than `latest`.
- `artifact.type: image` with the current build's image output.
- `deployPolicy.type: full` for a full release.

Run manually first. Confirm that the released function's image matches the pipeline output, and run `npm run check-site` against its gateway URL. Then configure the **GitHub Push trigger for `main`** in Code Pipeline. Merely committing these YAML files to Git does not create a pipeline or enable a trigger.

The full template contains build and release stages. To automate the post-release website check, append a command task in the console using a Node.js 20 environment, enable checkout of the source, and run:

```sh
node scripts/check-site.js https://YOUR_GATEWAY_DOMAIN
```

This check uses Node.js built-ins and does not require `npm ci` in that verification task. Deployments to the same function should run sequentially; avoid concurrent releases to one function.

## Verify a release and roll back

A release is complete when the pipeline succeeds, the released image tag matches the build output, the website check passes, and the browser renders the site correctly.

If validation fails, restore the previous successful version from veFaaS release history and rerun the website check. Retain the previous image tags in CR for reproducibility.

## Validation boundary and references

Local tests, Linux amd64 container build/startup, and website checks can validate the code and image. YAML parsing can validate file structure. **Code Pipeline's server-side validation, CR authorization, veFaaS release, API Gateway routing, and automatic triggering must be verified in your account during deployment.**

Official references:

- [veFaaS image deployment](https://docs.byteplus.com/en/docs/faas/Native_runtime_Image_Deployment)
- [veFaaS Web application development specifications](https://docs.byteplus.com/en/docs/faas/Native_runtime_Development_methods_Web_applications)
- [Create pipelines using YAML](https://docs.byteplus.com/en/docs/cp/Create_pipeline_via_YAML)
- [Image build configuration](https://docs.byteplus.com/en/docs/cp/Building_images)
- [Function deployment component](https://docs.byteplus.com/en/docs/cp/Resource_deployment_steps)
- [API Gateway trigger](https://docs.byteplus.com/id/docs/faas/Creating_a_API_Gateway_trigger)
- [English Feishu Wiki guide](https://bytedance.larkoffice.com/wiki/QqoqwueqbisD2tkR0jDczorBn1c)
