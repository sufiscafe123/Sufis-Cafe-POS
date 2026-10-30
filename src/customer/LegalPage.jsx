'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from '@/lib/router';
import { useCustomer } from './CustomerContext';
import CoffeeBean from './CoffeeBean';

// Terms & Conditions and Privacy Policy for the customer QR app. Open without logging in.
const BUSINESS = "Sufi's Cafe";
const ADDRESS = 'National Highway No. 8 (NH-8), Opposite Sumar Logistics, near Betadilaat Village, Kajipura, Kheda, Gujarat 387120';
const EMAIL = 'sufiscafe123@gmail.com';
const PHONE = '9173331535';
const UPDATED = '30 October 2026';

function Contact() {
  return (
    <p>
      {BUSINESS}, {ADDRESS}<br />
      Email: <a href={`mailto:${EMAIL}`}>{EMAIL}</a> · Phone: <a href={`tel:+91${PHONE}`}>+91 {PHONE}</a>
    </p>
  );
}

function TermsContent({ minSpend, stampsPerCard, rewards }) {
  return (
    <>
      <section>
        <h2>1. About these terms</h2>
        <p>These terms apply when you use the {BUSINESS} QR menu and loyalty program. By continuing, you agree to them. If you do not agree, please order through our staff instead.</p>
      </section>
      <section>
        <h2>2. Ordering from your table</h2>
        <ul>
          <li>Scan the QR code on your table and enter your name and mobile number to check in.</li>
          <li>The first order from a table is confirmed by our staff before it goes to the kitchen.</li>
          <li>We may refuse or cancel an order, for example when nobody is at the table or the order looks like a mistake.</li>
          <li>After your bill is generated you can still see the menu and your rewards for 2 hours. To order again, scan the QR code on your table.</li>
          <li>The counter QR code is for loyalty stamps and rewards only. Please give your order to our captain.</li>
        </ul>
      </section>
      <section>
        <h2>3. Prices and payment</h2>
        <ul>
          <li>Prices are in Indian Rupees (INR). Taxes are added as shown on your bill.</li>
          <li>You pay at the table or the counter by cash, UPI or card. The app does not take payments.</li>
          <li>The menu, prices and availability may change without notice.</li>
        </ul>
      </section>
      <section>
        <h2>4. Loyalty stamps and rewards</h2>
        <p>{BUSINESS} decides the loyalty rules: the minimum bill for a stamp, the number of stamps on a card and the rewards. The current rules are always shown in the app.</p>
        <ul>
          <li>Right now you earn 1 stamp for each bill of ₹{minSpend} or more. The stamp is added when your bill is generated.</li>
          <li>Right now a stamp card has {stampsPerCard} stamps.{rewards.length > 0 && <> The rewards are: {rewards.map((m, i) => (
            <React.Fragment key={m.milestoneId || i}>{i > 0 && (i === rewards.length - 1 ? ' and ' : ', ')}<strong>{m.title}</strong> at {m.requiredStamps} stamps</React.Fragment>
          ))}.</>}</li>
          <li>Rewards are free items, claimed at the counter: show your phone, and our staff will mark the reward as claimed.</li>
          <li>Stamps and rewards belong to your mobile number. They cannot be exchanged for cash or transferred.</li>
          <li>{BUSINESS} may change these rules, the rewards, or end the loyalty program at any time. Changes are shown in the app.</li>
        </ul>
      </section>
      <section>
        <h2>5. Food and allergies</h2>
        <p>Please tell our staff about any allergies or dietary needs before you order. Dishes may contain or come into contact with milk, nuts, gluten and other allergens.</p>
      </section>
      <section>
        <h2>6. Fair use</h2>
        <p>Please don&apos;t place orders for a table you are not sitting at, use someone else&apos;s mobile number, or misuse the app. We may cancel orders, remove stamps or block access when this happens.</p>
      </section>
      <section>
        <h2>7. Governing law</h2>
        <p>These terms are governed by the laws of India. Any dispute is subject to the courts of Kheda, Gujarat.</p>
      </section>
      <section>
        <h2>8. Contact us</h2>
        <Contact />
      </section>
    </>
  );
}

function PrivacyContent() {
  return (
    <>
      <section>
        <h2>1. Who we are</h2>
        <p>{BUSINESS} runs this QR menu and loyalty program. This policy explains what personal data we collect, why, and the choices you have.</p>
      </section>
      <section>
        <h2>2. What we collect</h2>
        <ul>
          <li><strong>Your name and mobile number</strong>, when you check in.</li>
          <li><strong>Your orders and visits</strong>: table, dishes, bills, and the date and time.</li>
          <li><strong>Your loyalty stamps and rewards</strong>, and when you claimed them.</li>
          <li>A login code saved on your phone&apos;s browser, so you stay checked in during your visit.</li>
        </ul>
        <p>We do not collect card or bank details, your location, or your contacts.</p>
      </section>
      <section>
        <h2>3. Why we use it</h2>
        <ul>
          <li>To take your order and serve it at your table.</li>
          <li>To run your loyalty stamp card and rewards.</li>
          <li>To print bills and keep the records required by law.</li>
          <li>To prevent misuse, such as orders placed from outside the cafe.</li>
        </ul>
        <p>We do not send you marketing messages by SMS, WhatsApp or email.</p>
      </section>
      <section>
        <h2>4. Who can see it</h2>
        <ul>
          <li>Only our staff, through their staff logins.</li>
          <li>Our service providers that store and run this app for us: Supabase (database) and Vercel (website hosting). They handle the data only on our behalf.</li>
          <li>Government authorities, only when the law requires it.</li>
        </ul>
        <p>We never sell or rent your personal data.</p>
      </section>
      <section>
        <h2>5. How long we keep it</h2>
        <p>We keep your details until you ask us to delete them. Bill records may be kept for as long as tax law requires, even after your profile is deleted.</p>
      </section>
      <section>
        <h2>6. Your choices</h2>
        <p>You can ask us to show, correct or delete your details at any time. Deleting your details also removes your stamps and rewards. Contact us below and we will reply as soon as possible, and within 30 days.</p>
      </section>
      <section>
        <h2>7. Security</h2>
        <p>The app uses a secure (https) connection, and access to guest data is limited to logged-in staff.</p>
      </section>
      <section>
        <h2>8. Children</h2>
        <p>Guests under 18 should use the app with the consent of a parent or guardian.</p>
      </section>
      <section>
        <h2>9. Changes to this policy</h2>
        <p>If we change this policy, the new version will appear on this page with a new date.</p>
      </section>
      <section>
        <h2>10. Contact us</h2>
        <Contact />
      </section>
    </>
  );
}

export default function LegalPage({ kind }) {
  const navigate = useNavigate();
  const { loyaltySettings } = useCustomer();
  const isTerms = kind === 'terms';

  const back = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/customer');
  };

  return (
    <div className="customer-viewport sh-page sl-page">
      <div className="lg-page">
        <header className="lg-head">
          <button className="lg-back" onClick={back} aria-label="Back"><ArrowLeft size={20} aria-hidden="true" /></button>
          <img className="lg-logo" src="/brand/sufis-logo.png" alt="" />
          <span className="lg-brand">Sufi&apos;s Cafe</span>
        </header>

        <h1 className="lg-title">{isTerms ? 'Terms & Conditions' : 'Privacy Policy'}</h1>
        <div className="lg-updated">Last updated {UPDATED}</div>
        <div className="sh-divider"><CoffeeBean size={16} /></div>

        <article className="lg-body">
          {isTerms
            ? <TermsContent
                minSpend={loyaltySettings?.minSpendForStamp ?? 200}
                stampsPerCard={loyaltySettings?.stampsPerCard || 8}
                rewards={(loyaltySettings?.milestones || []).filter(m => m.isActive !== false).sort((a, b) => a.requiredStamps - b.requiredStamps)}
              />
            : <PrivacyContent />}
        </article>

        <div className="lg-switch">
          {isTerms
            ? <Link href="/customer/privacy" replace>Read our Privacy Policy →</Link>
            : <Link href="/customer/terms" replace>Read our Terms &amp; Conditions →</Link>}
        </div>
      </div>
    </div>
  );
}
