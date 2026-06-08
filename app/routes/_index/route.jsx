import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>AL FAJR COD Form</h1>
        <p className={styles.text}>
          Gérez vos commandes en paiement à la livraison depuis une interface simple et professionnelle.
        </p>

        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input
                className={styles.input}
                type="text"
                name="shop"
                placeholder="alfajr-wex5ddvj.myshopify.com"
              />
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}

        <ul className={styles.list}>
          <li>
            <strong>COD Orders</strong>. Créez des commandes Shopify depuis un formulaire rapide.
          </li>
          <li>
            <strong>Personnalisation</strong>. Changez les couleurs, textes et champs du formulaire.
          </li>
          <li>
            <strong>Livraison Maroc</strong>. Frais automatiques selon la ville du client.
          </li>
        </ul>
      </div>
    </div>
  );
}