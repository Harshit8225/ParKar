import { useCallback, useState } from 'react';
import { errorMessage } from '../api/client';
import { paymentApi } from '../api/endpoints';

const RAZORPAY_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

const loadRazorpayScript = () =>
  new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(window.Razorpay);

    const existing = document.querySelector(`script[src="${RAZORPAY_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Razorpay));
      existing.addEventListener('error', () => reject(new Error('Could not load the payment gateway')));
      return undefined;
    }

    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT;
    script.async = true;
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => reject(new Error('Could not load the payment gateway'));
    document.body.appendChild(script);
    return undefined;
  });

/**
 * Drives a payment to completion.
 *
 * The backend never trusts the browser here: whatever the gateway hands back is
 * posted to /payments/verify, and only the server's signature check decides
 * whether the booking is confirmed.
 *
 * When the server reports mock mode (no Razorpay keys configured), the real
 * checkout is skipped and the server-issued mock signature is submitted
 * instead, so the whole flow is exercisable without a Razorpay account.
 */
export const useCheckout = () => {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const pay = useCallback(async (payment, { onSuccess, onFailure } = {}) => {
    setError('');
    setProcessing(true);

    const reportFailure = async (reason) => {
      setError(reason);
      try {
        await paymentApi.fail({ razorpayOrderId: payment.orderId, reason });
      } catch {
        // The held slot is reclaimed by the server either way; nothing to do.
      }
      setProcessing(false);
      if (onFailure) onFailure(reason);
    };

    const submitVerification = async (result) => {
      try {
        const verified = await paymentApi.verify({
          razorpayOrderId: result.razorpay_order_id,
          razorpayPaymentId: result.razorpay_payment_id,
          razorpaySignature: result.razorpay_signature,
        });
        setProcessing(false);
        if (onSuccess) onSuccess(verified);
        return verified;
      } catch (err) {
        await reportFailure(errorMessage(err, 'We could not verify your payment.'));
        return null;
      }
    };

    // ---- Mock mode: no gateway, server-signed test payment ----
    if (payment.mock) {
      return submitVerification({
        razorpay_order_id: payment.orderId,
        razorpay_payment_id: payment.mockPaymentId,
        razorpay_signature: payment.mockSignature,
      });
    }

    // ---- Live Razorpay checkout ----
    try {
      const Razorpay = await loadRazorpayScript();

      return new Promise((resolve) => {
        const checkout = new Razorpay({
          key: payment.keyId,
          amount: payment.amount,
          currency: payment.currency,
          name: payment.name || 'ParKar',
          description: payment.description,
          order_id: payment.orderId,
          prefill: payment.prefill || {},
          theme: { color: '#1f43ec' },
          handler: async (result) => resolve(await submitVerification(result)),
          modal: {
            ondismiss: async () => {
              await reportFailure('Payment was cancelled.');
              resolve(null);
            },
          },
        });

        checkout.on('payment.failed', async (response) => {
          await reportFailure(response?.error?.description || 'The payment failed at the gateway.');
          resolve(null);
        });

        checkout.open();
      });
    } catch (err) {
      await reportFailure(err.message || 'Could not start the payment.');
      return null;
    }
  }, []);

  return { pay, processing, error, setError };
};
