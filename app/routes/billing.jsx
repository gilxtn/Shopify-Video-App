import { unauthenticated } from "../shopify.server";
import { Banner, Page } from "@shopify/polaris";
import { useNavigate, useLoaderData } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import "@shopify/polaris/build/esm/styles.css";
import { useEffect } from "react";

export const loader = async ({ request }) => {
  const queryParams = new URLSearchParams(request.url.split("?")[1]);
  const shop = queryParams.get('shop');
  const chargeId = queryParams.get("charge_id");

  if (!chargeId) {
    return { error: true, message: "Charge Id not found.", apiKey: process.env.SHOPIFY_API_KEY || "", onboardingComplete: false };
  }

  const { admin, session } = await unauthenticated.admin(shop);
  const response = await admin.graphql(`
    query {
      currentAppInstallation {
        allSubscriptions(first: 10, reverse: true) {
          nodes {
            id
            status
            name
            test
          }
        }
      }
    }
  `);
  const data = await response.json();
  const subscriptions = data.data.currentAppInstallation.allSubscriptions;
  const findCharge = subscriptions.nodes.find(subscription => subscription.id.includes(chargeId));

  if (!findCharge) {
    return { error: true, message: "Charge not found.", apiKey: process.env.SHOPIFY_API_KEY || "", onboardingComplete: false };
  }

  // if charge is active
  if (findCharge.status === "ACTIVE") {
    console.log("Charge is active.");
  //   const checkMetafield = await admin.graphql(`query {
  //   currentAppInstallation {
  //     id
  //     metafields(first: 20) {
  //       edges {
  //         node {
  //           namespace
  //           key
  //           value
  //         }
  //       }
  //     }
  //   }
  // }`);
  //   const result = await checkMetafield.json();
  //   console.log(result?.data,"result?.dataresult?.data000000")
  //   const currentMetafields = result?.data?.currentAppInstallation?.metafields?.edges;
  //   const onboardingMetafield = currentMetafields?.find(
  //     (field) => field.node.namespace === "Auto-Video" && field.node.key === "app_onboarding"
  //   );
  //   const onboardingValue = onboardingMetafield?.node?.value;
  //   const onboardingComplete = onboardingValue === "true";

    return { error: false, message: "", apiKey: process.env.SHOPIFY_API_KEY || "", session,onboardingComplete: false };
  }

  // if charge is active end
  return { error: true, message: "Charge is not active.", apiKey: process.env.SHOPIFY_API_KEY || "", session, onboardingComplete: false };
};


export default function App() {
  const navigate = useNavigate();
  const { error, message, apiKey, session, onboardingComplete } = useLoaderData();

  useEffect(() => {
    if (!error) {
      const target = onboardingComplete ? "/app" : "/app/welcome";
      console.log("No error----", target);
      navigate(target);
    }
  }, [error]);

  if (!error) {
    return (
      <AppProvider isEmbeddedApp apiKey={apiKey}>
        <Page narrowWidth>
          <div>Redirecting...</div>
        </Page>
      </AppProvider>
    );
  }

  if (error) {
    return (
      <AppProvider isEmbeddedApp apiKey={apiKey}>
        <Page >
          <Banner title="Error" tone="critical">
            <p>{message}</p>
          </Banner>
        </Page>
      </AppProvider>
    );
  }
}