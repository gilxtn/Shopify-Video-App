import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

  if (!admin) {
    return new Response("No admin context (likely shop uninstalled)", { status: 200 });
  }

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
    case "SHOP_REDACT":
      console.log(`Received ${topic} webhook from ${shop}`, payload);
      return new Response("Webhook processed", { status: 200 });

    default:
      return new Response("Unhandled webhook topic", { status: 404 });
  }
};

export const loader = async () => {
  return new Response(JSON.stringify({ message: "Webhook received" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
};
