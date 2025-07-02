import { Card, Page ,Layout , Text, Box, InlineGrid, BlockStack, Icon, Badge, ProgressBar, InlineStack } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { useLoaderData } from "@remix-run/react";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  ChartLineIcon
} from '@shopify/polaris-icons';


export const loader = async ({ request }) => {
  const { admin, session, redirect } = await authenticate.admin(request);

  const subscriptionQuery = `
    query {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
          test
          trialDays
          createdAt
          currentPeriodEnd
          lineItems {
            plan {
              pricingDetails {
                __typename
                ... on AppRecurringPricing {
                  interval
                  price {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const billingRes = await admin.graphql(subscriptionQuery);
  const { data: billingData } = await billingRes.json();
  const activeSubscriptions = billingData?.currentAppInstallation?.activeSubscriptions || [];
  console.log(activeSubscriptions,"activeSubscriptions---")

  const currentSubscription = activeSubscriptions[0];
  const currentPlan = currentSubscription?.name || "Trial";
  const status = currentSubscription?.status;
  const interval = currentSubscription?.lineItems?.[0]?.plan?.pricingDetails?.interval || "";
  const price = currentSubscription?.lineItems?.[0]?.plan?.pricingDetails?.price || {};
  const createdAt = currentSubscription?.createdAt;
  const nextBillingDate = currentSubscription?.currentPeriodEnd;
  const isTest = currentSubscription?.test;
  const createdDate = new Date(currentSubscription?.createdAt);
  const endDate = new Date(currentSubscription?.currentPeriodEnd);
  const today = new Date();

  const trialDays = currentSubscription?.trialDays || 0;
  const trialEndDate = new Date(createdDate);
  trialEndDate.setDate(createdDate.getDate() + trialDays);

  const trialDaysLeft = Math.max(
    0,
    Math.ceil((trialEndDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  );
  const trialUsed = trialDays - trialDaysLeft;
  let count = 0;
  let hasNextPage = true;
  let cursor = null;
  while (hasNextPage) {
    const query = `
        query getProducts($cursor: String) {
        products(first: 100, query: "tag:youtubevideo", after: $cursor) {
            pageInfo {
            hasNextPage
            }
            edges {
            cursor
            node {
                id
            }
            }
        }
        }
    `;

    const response = await admin.graphql(query, {
        variables: { cursor },
    });
    const result = await response.json();
    const edges = result.data.products.edges;
    count += edges.length;
    hasNextPage = result.data.products.pageInfo.hasNextPage;
    if (hasNextPage) {
        cursor = edges[edges.length - 1].cursor;
    }
  }

  return { count, currentPlan, status, interval, price, createdAt,
     nextBillingDate, isTest, trialDays, trialDaysLeft, trialUsed,
  };
}

export const action = async ({ request }) => {
    const { admin, session, redirect } = await authenticate.admin(request);
    return null
}

export default function Account (){
 const { count, currentPlan, status, interval, price, createdAt, nextBillingDate, 
  isTest, trialDays, trialDaysLeft, trialUsed} = useLoaderData();
 const shopify = useAppBridge();
        
  return (
  <Page title="Account">
  <Layout>
    <Layout.Section>
      <InlineGrid columns={{ sm: "1fr", md: "1fr 1fr" , lg:"5fr 3fr"}} alignItems="start" gap="400">
          <Card>
          <BlockStack gap="300" padding="400">
            <InlineGrid columns={"1fr auto"} align="center">
                <Text variant="headingLg">Subscription Plan</Text>
                <Badge tone={status === "ACTIVE" ? "success" : "critical"} status={status.toLowerCase()}>
                {status}
                </Badge>
            </InlineGrid>
            {trialDays > 0 && (
                <BlockStack gap="200">
                    <InlineStack gap="200">
                        <Badge size="large" tone="attention" >Free Trial: <strong>{trialDaysLeft} days left</strong></Badge>
                    </InlineStack>
                </BlockStack>
            )}
            <Text>Plan: <strong>{currentPlan}</strong></Text>
            <Text>Billing Interval: <strong>{interval}</strong></Text>
            <Text>Price: <strong>{price.amount} {price.currencyCode}</strong></Text>
            <Text>Started On: <strong>{new Date(createdAt).toLocaleDateString()}</strong></Text>
            <Text>Next Billing Date: <strong>{new Date(nextBillingDate).toLocaleDateString()}</strong></Text>         
          </BlockStack>
        </Card>
    </InlineGrid>
    </Layout.Section>
      <Layout.Section>
      </Layout.Section>
  </Layout>
  </Page>
)}