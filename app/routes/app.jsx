import { Link, Outlet, useLoaderData, useNavigate, useNavigation, useRouteError  } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu, useAppBridge } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";
import { useEffect, useState } from "react";
import { Layout, Page, Spinner } from "@shopify/polaris";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];
export const loader = async ({ request }) => {



   const { admin, redirect, session  } = await authenticate.admin(request);

  // Check for active subscription using managed pricing
  const subscriptionResponse = await admin.graphql(`
    query {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
        }
      }
    }
  `);
  
  const subscriptionResult = await subscriptionResponse.json();
  const activeSubscriptions = subscriptionResult?.data?.currentAppInstallation?.activeSubscriptions || [];
  const hasActiveSubscription = activeSubscriptions.length > 0 && 
    activeSubscriptions.some(sub => sub.status === "ACTIVE");

  // If no active subscription, redirect to Shopify's managed pricing page
  if (!hasActiveSubscription) {
    const planSelectionUrl = `https://admin.shopify.com/store/${session.shop}/charges/${process.env.SHOPIFY_API_KEY}/pricing_plans`;
    return redirect(planSelectionUrl);
  }

  const response = await admin.graphql(`
    query {
      currentAppInstallation {
        metafields(first: 20) {
          edges {
            node {
              namespace
              key
              value
            }
          }
        }
      }
    }
  `);
  const result = await response.json();
  const currentMetafields = result?.data?.currentAppInstallation?.metafields?.edges || [];
  const onboardingMetafield = currentMetafields?.find(
    (field) => field.node.namespace === "Auto-Video" && field.node.key === "app_onboarding"
  );
  const onboardingComplete = onboardingMetafield?.node?.value === "true";
  // const url = new URL(request.url);
  // const currentPath = url.pathname;
  // console.log(currentPath,"currentPath---")

  // if(!onboardingComplete && (currentPath !== "/app/help" || currentPath !== "/welcome")){
  //   console.log("Navigate to welcome page now");
  //   // return redirect("/welcome");
  // }

  return { apiKey: process.env.SHOPIFY_API_KEY || "" , onboardingComplete : onboardingComplete }
};


export default function App() {
  const { apiKey , onboardingComplete} = useLoaderData();
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";
  const shopify = useAppBridge();
  useEffect(()=>{
    if(isLoading){
      shopify.loading(true);
    }else{
      shopify.loading(false);
    }
  },[isLoading])


  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
          <Link to="/app" rel="home">Home</Link>
          {onboardingComplete && 
            <>
            <Link to="/app/analytics">Analytics</Link>
            <Link to="/app/account">Account</Link>
            <Link to="/app/welcome">Getting Started</Link>
            </>
          }
      </NavMenu>
      {isLoading && 
        <Page>
          <Layout>
            <Layout.Section>
                <div style={{minHeight:"80vh", display:"flex", justifyContent:"center", alignItems:"center"}}>
                  <Spinner size="small"/>
                </div>
            </Layout.Section>
          </Layout>
        </Page>
        }
      {!isLoading && <Outlet />}
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

