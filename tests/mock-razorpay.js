// Loaded only by the integration test child process. No real payment requests are sent.
const original = globalThis.fetch;
const orders = new Map();
globalThis.fetch = async (input, options) => {
  const url = new URL(input);
  if (url.origin !== "https://api.razorpay.com")
    return original(input, options);
  if (url.pathname === "/v1/orders") {
    const payload = JSON.parse(options.body),
      id = `order_Test${orders.size + 1}`;
    orders.set(id, payload);
    return Response.json({ id, ...payload });
  }
  if (url.pathname.startsWith("/v1/payments/")) {
    const id = url.pathname.split("/").pop(),
      suffix = id.match(/(\d+)$/)?.[1],
      order_id = `order_Test${suffix}`,
      order = orders.get(order_id);
    if (order)
      return Response.json({
        id,
        order_id,
        amount: order.amount,
        currency: "INR",
        status: id.startsWith("pay_Authorized") ? "authorized" : "captured",
      });
  }
  return Response.json({}, { status: 404 });
};
