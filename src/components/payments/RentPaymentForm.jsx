import { useState } from "react";

import {
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

import { money } from "../../api.js";

export default function RentPaymentForm({ amount, onDone }) {
  const stripe = useStripe();
  const elements = useElements();

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [ready, setReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements || !ready || processing) return;

    setLoading(true);
    setError("");

    try {
      const { error: stripeError, paymentIntent } = await stripe.confirmPayment(
        {
          elements,

          confirmParams: {
            return_url: `${window.location.origin}/rent?payment=return`,
          },

          redirect: "if_required",
        },
      );

      if (stripeError) {
        setError(stripeError.message || "Payment could not be completed.");

        return;
      }

      if (paymentIntent) {
        onDone?.(paymentIntent);
      }
    } catch (err) {
      console.error("Stripe payment error:", err);

      setError(err.message || "Unable to process payment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="stripe-form">
      <div className="payment-amount">
        <span>Payment amount</span>

        <strong>{money(amount)}</strong>
      </div>

      <PaymentElement
        onReady={() => {
          setReady(true);
          setErrorMessage("");
        }}
        onLoadError={({ error }) => {
          setReady(false);
          setErrorMessage(error.message || "Payment form failed to load.");
          console.error("Payment Element load error:", error);
        }}
      />

      {errorMessage && <p role="alert">{errorMessage}</p>}

      <button
        type="submit"
        disabled={!stripe || !elements || !ready || processing}
      >
        {processing ? "Processing..." : "Pay now"}
      </button>

      <p className="secure-note">
        Payment information is securely processed by Stripe.
      </p>
    </form>
  );
}
