// Outbound-email seam (Phase 6). No mail provider has been approved, so
// delivery is not implemented: this function validates its inputs, logs
// nothing sensitive (never the recipient address, subject, or body), and
// resolves a non-sent outcome. When a provider is approved, delivery happens
// here and only here; callers already fan out through maybeNotifyMoneyEvents.
async function maybeSendEmail({ to, subject, text } = {}) {
  if (typeof to !== "string" || typeof subject !== "string" || typeof text !== "string") {
    return { sent: false, provider: "none", reason: "invalid-email-payload" };
  }
  return { sent: false, provider: "none", reason: "no-provider" };
}

module.exports = { maybeSendEmail };
