import { useEffect, useMemo, useState } from "react";
import { Elements } from "@stripe/react-stripe-js";

import { stripePromise } from "../lib/stripe.js";

import RentPaymentForm from "../components/payments/RentPaymentForm.jsx";
import { api, money, shortDate } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

import {
  Badge,
  Empty,
  Field,
  Icon,
  Modal,
  PageHeader,
  Spinner,
  Toast,
} from "../components/UI.jsx";

export default function Rent() {
  const { user } = useAuth();
  const [charges, setCharges] = useState(null),
    [payments, setPayments] = useState([]),
    [leases, setLeases] = useState([]),
    [payOpen, setPayOpen] = useState(false),
    [manualOpen, setManualOpen] = useState(false),
    [toast, setToast] = useState("");

  const [clientSecret, setClientSecret] = useState(""),
    [amount, setAmount] = useState(""),
    [checkoutAmount, setCheckoutAmount] = useState(0),
    [leaseId, setLeaseId] = useState("");

  const load = async () => {
    const [a, b, c] = await Promise.all([
      api("/charges"),
      api("/payments"),
      api("/leases"),
    ]);
    setCharges(a);
    setPayments(b);
    setLeases(c);
    if (user.role === "tenant") {
      const activeLease = c.find((lease) => lease.status === "active");

      if (activeLease) {
        setLeaseId((current) =>
          current && c.some((lease) => lease._id === current)
            ? current
            : activeLease._id,
        );
      }
    }
  };
  useEffect(() => {
    load();
  }, []);

  const selectedLeaseCharges = useMemo(() => {
    if (!charges) {
      return [];
    }

    if (user.role !== "tenant" || !leaseId) {
      return charges;
    }

    return charges.filter((charge) => {
      const chargeLeaseId = charge.leaseId?._id || charge.leaseId;

      return String(chargeLeaseId) === String(leaseId);
    });
  }, [charges, leaseId, user.role]);

  const openBalance = useMemo(
    () =>
      selectedLeaseCharges
        .filter((charge) => ["open", "partial"].includes(charge.status))
        .reduce((total, charge) => total + Number(charge.balance || 0), 0),
    [selectedLeaseCharges],
  );

  const beginPay = async (requestedAmount = null) => {
    const rawAmount = requestedAmount !== null ? requestedAmount : amount;

    const numericAmount = Number.parseFloat(
      String(rawAmount).replace(/[$,]/g, ""),
    );

    console.log("Payment amount:", {
      amount,
      requestedAmount,
      numericAmount,
    });

    if (!leaseId) {
      setToast("Select a lease");
      return;
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setToast("Enter a valid payment amount");
      return;
    }

    if (numericAmount > openBalance) {
      setToast("Payment cannot exceed the outstanding balance");
      return;
    }

    try {
      const result = await api("/payments/create-intent", {
        method: "POST",

        body: JSON.stringify({
          leaseId,
          amount: numericAmount,
        }),
      });

      setCheckoutAmount(result.amount ?? numericAmount);

      setClientSecret(result.clientSecret);

      setPayOpen(true);
    } catch (error) {
      console.error("Create payment intent error:", error);

      setToast(error.message || "Unable to start payment");
    }
  };

  const manual = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/payments/manual", {
      method: "POST",
      body: JSON.stringify({
        leaseId: fd.get("leaseId"),
        amount: Number(fd.get("amount")),
        method: fd.get("method"),
        reference: fd.get("reference"),
        receivedAt: fd.get("receivedAt") || new Date(),
      }),
    });
    setManualOpen(false);
    setToast("Payment recorded");
    load();
  };

  const selectedLeasePayments = useMemo(() => {
    if (user.role !== "tenant" || !leaseId) {
      return payments;
    }

    return payments.filter((payment) => {
      const paymentLeaseId = payment.leaseId?._id || payment.leaseId;

      return String(paymentLeaseId) === String(leaseId);
    });
  }, [payments, leaseId, user.role]);

  if (!charges) return <Spinner />;

  return (
    <>
      <PageHeader
        eyebrow="Ledger"
        title={user.role === "tenant" ? "Rent & payments" : "Rent ledger"}
        description={
          user.role === "tenant"
            ? "Pay securely and review your payment history."
            : "Track every charge, payment, balance, and payment method."
        }
        action={
          user.role === "tenant" ? (
            <button
              className="btn primary"
              onClick={() => {
                const fullBalance = openBalance.toFixed(2);

                setAmount(fullBalance);

                beginPay(fullBalance);
              }}
              disabled={!openBalance}
            >
              <Icon name="dollar" />
              Pay balance
            </button>
          ) : (
            <button className="btn primary" onClick={() => setManualOpen(true)}>
              <Icon name="plus" />
              Record payment
            </button>
          )
        }
      />

      <div className="rent-summary">
        <div className="balance-card">
          <span>Outstanding balance</span>
          <strong>{money(openBalance)}</strong>
          <p>
            {charges.filter((c) => c.status === "partial").length} partially
            paid · {charges.filter((c) => c.status === "open").length} open
          </p>
        </div>
        {user.role === "tenant" && (
          <div className="quick-pay">
            <Field label="Lease">
              <select
                value={leaseId}
                onChange={(e) => {
                  setLeaseId(e.target.value);

                  setAmount("");
                }}
              >
                <option value="">Select lease</option>

                {leases
                  .filter((lease) => lease.status === "active")
                  .map((lease) => (
                    <option key={lease._id} value={lease._id}>
                      {lease.propertyId?.name} · {lease.unitId?.label}
                    </option>
                  ))}
              </select>
            </Field>

            <Field label="Payment amount">
              <input
                type="number"
                min="0.50"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
              <button
                type="button"
                className="btn primary"
                onClick={() => beginPay()}
                disabled={!leaseId || !openBalance}
              >
                Continue
              </button>
            </Field>
            <small>
              Payment methods shown are controlled by your Stripe account
              configuration.
            </small>
          </div>
        )}
      </div>

      <section className="panel table-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Charges</span>
            <h2>Rent & fees</h2>
          </div>
        </div>
        {selectedLeaseCharges.length ? (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  {user.role !== "tenant" && <th>Tenant</th>}
                  <th>Due date</th>
                  <th>Original</th>
                  <th>Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {selectedLeaseCharges.map((c) => (
                  <tr key={c._id}>
                    <td>
                      <strong>{c.description}</strong>
                      <span className="table-sub">
                        {c.leaseId?.propertyId?.name} ·{" "}
                        {c.unitId?.label || c.leaseId?.unitId?.label}
                      </span>
                    </td>
                    {user.role !== "tenant" && <td>{c.tenantId?.name}</td>}
                    <td>{shortDate(c.dueDate)}</td>
                    <td>{money(c.amount)}</td>
                    <td>
                      <strong>{money(c.balance)}</strong>
                    </td>
                    <td>
                      <Badge
                        tone={
                          c.status === "paid"
                            ? "success"
                            : c.status === "partial"
                              ? "warning"
                              : new Date(c.dueDate) < new Date()
                                ? "danger"
                                : "neutral"
                        }
                      >
                        {c.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No charges"
            text="Charges are created when an active lease is initialized."
          />
        )}
      </section>

      <section className="panel table-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">History</span>
            <h2>Payments</h2>
          </div>
        </div>
        {selectedLeasePayments.length ? (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  {user.role !== "tenant" && <th>Tenant</th>}
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {selectedLeasePayments.map((p) => (
                  <tr key={p._id}>
                    <td>{shortDate(p.receivedAt || p.createdAt)}</td>
                    {user.role !== "tenant" && <td>{p.tenantId?.name}</td>}
                    <td className="capitalize">
                      {p.method ? p.method.replaceAll("_", " ") : "—"}
                    </td>
                    <td>
                      {p.reference ||
                        p.stripePaymentIntentId?.slice(-10) ||
                        "—"}
                    </td>
                    <td>
                      <strong>{money(p.amount)}</strong>
                    </td>
                    <td>
                      <Badge
                        tone={
                          p.status === "succeeded"
                            ? "success"
                            : p.status === "failed"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {p.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No payments yet"
            text="Successful and manually recorded payments appear here."
          />
        )}
      </section>

      <Modal
        open={payOpen}
        onClose={() => {
          setPayOpen(false);
          setClientSecret("");
          setCheckoutAmount(0);
        }}
        title="Secure rent payment"
      >
        {clientSecret && stripePromise ? (
          <Elements
            key={clientSecret}
            stripe={stripePromise}
            options={{
              clientSecret,

              appearance: {
                theme: "stripe",

                variables: {
                  borderRadius: "10px",
                },
              },
            }}
          >
            <RentPaymentForm
              amount={checkoutAmount}
              onDone={async (paymentIntent) => {
                setPayOpen(false);

                setClientSecret("");

                if (paymentIntent.status === "succeeded") {
                  setToast("Payment successful. Updating your ledger...");
                } else {
                  setToast(
                    "Payment submitted. Status will update after Stripe confirms it.",
                  );
                }

                await load();

                setTimeout(load, 2000);
              }}
            />
          </Elements>
        ) : (
          <div className="alert warning">
            Stripe publishable key is not configured.
          </div>
        )}
      </Modal>
      <Modal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title="Record offline payment"
      >
        <form className="form-grid" onSubmit={manual}>
          <Field label="Lease">
            <select name="leaseId" required>
              <option value="">Select lease</option>
              {leases
                .filter((l) => l.status === "active")
                .map((l) => (
                  <option key={l._id} value={l._id}>
                    {leases
                      .filter((lease) => lease.status === "active")
                      .map((lease) => {
                        const primaryTenant = lease.tenants?.find(
                          (tenant) => tenant.role === "primary",
                        )?.userId;

                        return (
                          <option key={lease._id} value={lease._id}>
                            {primaryTenant?.name || "Tenant"} ·{" "}
                            {lease.propertyId?.name} / {lease.unitId?.label}
                          </option>
                        );
                      })}{" "}
                    · {l.propertyId?.name} / {l.unitId?.label}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Amount">
            <input
              name="amount"
              required
              type="number"
              min="0.01"
              step="0.01"
            />
          </Field>
          <Field label="Method">
            <select name="method">
              <option value="cash">Cash</option>
              <option value="check">Check</option>
              <option value="ach">ACH / bank transfer</option>
              <option value="money_order">Money order</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Reference">
            <input name="reference" placeholder="Check # or confirmation" />
          </Field>
          <Field label="Received date">
            <input
              name="receivedAt"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </Field>
          <div className="form-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={() => setManualOpen(false)}
            >
              Cancel
            </button>
            <button className="btn primary">Record payment</button>
          </div>
        </form>
      </Modal>
      <Toast
        message={toast}
        type={toast.includes("configured") ? "error" : "success"}
        onClose={() => setToast("")}
      />
    </>
  );
}
