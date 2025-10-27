import {
  Box,
  Card,
  Layout,
  Link,
  List,
  Page,
  Text,
  BlockStack,
  Button
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import prisma from "../db.server";
 import fs from "fs";
 import { useFetcher } from "@remix-run/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  // Perform backup of the database
  return null;
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Fetch data from ProductExtendedInfo
  const data = await prisma.VideoPlayCount.findMany();

  // Save to local file (inside /backups folder)
 
  const filePath = `./backups/VideoPlayCount${shopDomain}_${Date.now()}.json`;
  fs.mkdirSync("./backups", { recursive: true });
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      data,
      (_, value) => (typeof value === "bigint" ? value.toString() : value),
      2
    )
  );


  console.log(`✅ Backup created at ${filePath} with ${data.length} records`);

  return new Response(JSON.stringify({ success: true, count: data.length }), {
    headers: { "Content-Type": "application/json" },
  });
};


export default function AdditionalPage() {
    const fetcher = useFetcher();
  return (
    <Page>
      <TitleBar title="Additional page" />
      <Layout>
         
        <Layout.Section>
          <Button
          onClick={() => {
            fetcher.submit({}, { method: "post" });
          }}
          loading={fetcher.state !== "idle"}
        >
          Do backup
        </Button>
        {fetcher.data?.success && (
          <Text variant="bodyMd" tone="success">
            ✅ Backup completed — {fetcher.data.count} rows exported
          </Text>
        )}
          <Card>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                The app template comes with an additional page which
                demonstrates how to create multiple pages within app navigation
                using{" "}
                <Link
                  url="https://shopify.dev/docs/apps/tools/app-bridge"
                  target="_blank"
                  removeUnderline
                >
                  App Bridge
                </Link>
                .
              </Text>
              <Text as="p" variant="bodyMd">
                To create your own page and have it show up in the app
                navigation, add a page inside <Code>app/routes</Code>, and a
                link to it in the <Code>&lt;NavMenu&gt;</Code> component found
                in <Code>app/routes/app.jsx</Code>.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Resources
              </Text>
              <List>
                <List.Item>
                  <Link
                    url="https://shopify.dev/docs/apps/design-guidelines/navigation#app-nav"
                    target="_blank"
                    removeUnderline
                  >
                    App nav best practices
                  </Link>
                </List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function Code({ children }) {
  return (
    <Box
      as="span"
      padding="025"
      paddingInlineStart="100"
      paddingInlineEnd="100"
      background="bg-surface-active"
      borderWidth="025"
      borderColor="border"
      borderRadius="100"
    >
      <code>{children}</code>
    </Box>
  );
}
