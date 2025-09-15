// app/routes/after-billing.jsx
import { json } from "@remix-run/node";
import { unauthenticated } from "../shopify.server";
import { useEffect } from "react";
import { useLoaderData, useNavigate } from "@remix-run/react";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const chargeId = url.searchParams.get("charge_id");

  if (!shop || !chargeId) {
    return json({ error: true, message: "Missing shop or charge_id" });
  }

  const { admin, session } = await unauthenticated.admin(shop);

  // ✅ check subscriptions
  const response = await admin.graphql(`
    query {
      currentAppInstallation {
        allSubscriptions(first: 20, reverse: true) {
          nodes {
            id
            status
          }
        }
      }
    }
  `);
  const data = await response.json();
  const subscriptions = data.data.currentAppInstallation.allSubscriptions.nodes;
  const findCharge = subscriptions.find((sub) => sub.id.includes(chargeId));

  if (!findCharge || findCharge.status !== "ACTIVE") {
    return json({ error: true, message: "Charge not active" });
  }

  return json({ error: false, shop: session.shop });
};

export default function AfterBilling() {
  const { error, shop } = useLoaderData();
  const navigate = useNavigate();

  useEffect(() => {
    if (!error && shop) {
        // navigate("/app");
      // ✅ embedded redirect to your dashboard
      window.top.location.href = `https://${shop}/admin/apps/autovid/app`;
    }
  }, [error, shop]);

  return <p>Redirecting...</p>;
}
