import { useLoaderData, Form, useActionData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getAllThemes } from "../lib/themes";
import "../styles/premium.css";
import { useState } from "react";

const DEFAULT_SETTINGS = {
  buttonText: "Commander en paiement à la livraison",
  buttonColor: "#0D47C7",
  buttonTextColor: "#FFFFFF",
  borderRadius: 14,
  popupTitle: "Commande rapide",
  successPageUrl: "/pages/merci-commande",
  showFullName: true,
  showPhone: true,
  showCity: true,
  showAddress: true
};

async function saveSettingsToShopifyMetafield(admin, settings) {
  const currentAppInstallationQuery = `
    query {
      currentAppInstallation {
        id
      }
    }
  `;

  const appInstallationResponse = await admin.graphql(currentAppInstallationQuery);
  const appInstallationJson = await appInstallationResponse.json();

  const appInstallationId =
    appInstallationJson?.data?.currentAppInstallation?.id;

  if (!appInstallationId) {
    throw new Error("App installation ID not found");
  }

  const metafieldMutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
          type
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const metafieldVariables = {
    metafields: [
      {
        ownerId: appInstallationId,
        namespace: "cod_settings",
        key: "theme",
        type: "json",
        value: JSON.stringify(settings)
      }
    ]
  };

  const metafieldResponse = await admin.graphql(metafieldMutation, {
    variables: metafieldVariables
  });

  const metafieldJson = await metafieldResponse.json();
  const errors = metafieldJson?.data?.metafieldsSet?.userErrors || [];

  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.message).join(", "));
  }

  return true;
}

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let settings = await prisma.codSettings.findUnique({
    where: { shop }
  });

  if (!settings) {
    settings = await prisma.codSettings.create({
      data: {
        shop,
        ...DEFAULT_SETTINGS
      }
    });
  }

  let emailSettings = await prisma.emailNotification.findUnique({
    where: { shop }
  });

  if (!emailSettings) {
    emailSettings = await prisma.emailNotification.create({
      data: { shop }
    });
  }

  const [themes, zones, orders] = await Promise.all([
    prisma.colorTheme.findMany({ where: { shop } }),
    prisma.shippingZone.findMany({
      where: { shop },
      orderBy: { zone: "asc" }
    }),
    prisma.codOrder.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 50
    })
  ]);

  const orderStats = {
    total: await prisma.codOrder.count({ where: { shop } }),
    thisMonth: await prisma.codOrder.count({
      where: {
        shop,
        createdAt: { gte: new Date(new Date().setDate(1)) }
      }
    }),
    totalRevenue: (
      await prisma.codOrder.aggregate({
        where: { shop },
        _sum: { total: true }
      })
    )._sum.total || 0
  };

  return {
    settings,
    themes,
    zones,
    orders,
    emailSettings,
    orderStats,
    presetThemes: getAllThemes()
  };
}

export async function action({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("_action");

  try {
    if (actionType === "updateSettings") {
      const newSettings = {
        buttonText:
          formData.get("buttonText") ||
          DEFAULT_SETTINGS.buttonText,

        buttonColor:
          formData.get("buttonColor") ||
          DEFAULT_SETTINGS.buttonColor,

        buttonTextColor:
          formData.get("buttonTextColor") ||
          DEFAULT_SETTINGS.buttonTextColor,

        borderRadius:
          Number(formData.get("borderRadius")) ||
          DEFAULT_SETTINGS.borderRadius,

        popupTitle:
          formData.get("popupTitle") ||
          DEFAULT_SETTINGS.popupTitle,

        successPageUrl:
          formData.get("successPageUrl") ||
          DEFAULT_SETTINGS.successPageUrl,

        showFullName: formData.get("showFullName") === "on",
        showPhone: formData.get("showPhone") === "on",
        showCity: formData.get("showCity") === "on",
        showAddress: formData.get("showAddress") === "on"
      };

      await prisma.codSettings.upsert({
        where: { shop },
        update: newSettings,
        create: {
          shop,
          ...newSettings
        }
      });

      await saveSettingsToShopifyMetafield(admin, newSettings);

      return {
        success: true,
        message: "Paramètres mis à jour et synchronisés avec la boutique"
      };
    }

    if (actionType === "applyTheme") {
      const theme = JSON.parse(formData.get("theme"));

      const currentSettings =
        await prisma.codSettings.findUnique({ where: { shop } });

      const newSettings = {
        buttonText:
          formData.get("buttonText") ||
          currentSettings?.buttonText ||
          DEFAULT_SETTINGS.buttonText,

        buttonColor:
          theme.buttonColor ||
          currentSettings?.buttonColor ||
          DEFAULT_SETTINGS.buttonColor,

        buttonTextColor:
          theme.textColor ||
          currentSettings?.buttonTextColor ||
          DEFAULT_SETTINGS.buttonTextColor,

        borderRadius:
          currentSettings?.borderRadius ||
          DEFAULT_SETTINGS.borderRadius,

        popupTitle:
          currentSettings?.popupTitle ||
          DEFAULT_SETTINGS.popupTitle,

        successPageUrl:
          currentSettings?.successPageUrl ||
          DEFAULT_SETTINGS.successPageUrl,

        showFullName:
          currentSettings?.showFullName ??
          DEFAULT_SETTINGS.showFullName,

        showPhone:
          currentSettings?.showPhone ??
          DEFAULT_SETTINGS.showPhone,

        showCity:
          currentSettings?.showCity ??
          DEFAULT_SETTINGS.showCity,

        showAddress:
          currentSettings?.showAddress ??
          DEFAULT_SETTINGS.showAddress
      };

      await prisma.codSettings.upsert({
        where: { shop },
        update: newSettings,
        create: {
          shop,
          ...newSettings
        }
      });

      await saveSettingsToShopifyMetafield(admin, newSettings);

      return { success: true, message: "Thème appliqué" };
    }

    if (actionType === "addZone") {
      await prisma.shippingZone.create({
        data: {
          shop,
          zone: formData.get("zone"),
          fee: Number(formData.get("fee")),
          estimatedDays: Number(formData.get("estimatedDays")) || null
        }
      });

      return { success: true, message: "Zone de livraison ajoutée" };
    }

    if (actionType === "deleteZone") {
      await prisma.shippingZone.delete({
        where: { id: Number(formData.get("zoneId")) }
      });

      return { success: true, message: "Zone supprimée" };
    }

    if (actionType === "updateEmail") {
      await prisma.emailNotification.upsert({
        where: { shop },
        update: {
          enabled: formData.get("enabled") === "on",
          senderEmail: formData.get("senderEmail"),
          sendToMerchant: formData.get("sendToMerchant") === "on",
          sendToCustomer: formData.get("sendToCustomer") === "on"
        },
        create: {
          shop,
          enabled: formData.get("enabled") === "on",
          senderEmail: formData.get("senderEmail"),
          sendToMerchant: formData.get("sendToMerchant") === "on",
          sendToCustomer: formData.get("sendToCustomer") === "on"
        }
      });

      return { success: true, message: "Paramètres email mis à jour" };
    }

    return { success: false, message: "Action invalide" };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

export default function PremiumDashboard() {
  const {
    settings,
    themes,
    zones,
    orders,
    emailSettings,
    orderStats,
    presetThemes
  } = useLoaderData();

  const actionData = useActionData();
  const [activeTab, setActiveTab] = useState("dashboard");

  const [previewSettings, setPreviewSettings] = useState(
    settings || DEFAULT_SETTINGS
  );

  return (
    <div className="premium-container">
      <div className="header-section">
        <h1 className="header-title">🚀 AL FAJR Premium COD</h1>
        <p className="header-subtitle">
          Tableau de bord avancé pour gérer vos commandes, thèmes et paramètres
        </p>
      </div>

      {actionData?.success && (
        <div className="alert alert-success">✓ {actionData.message}</div>
      )}

      {actionData?.success === false && (
        <div className="alert alert-error">✗ {actionData.message}</div>
      )}

      <div className="tabs-container">
        <button
          className={`tab-button ${activeTab === "dashboard" ? "active" : ""}`}
          onClick={() => setActiveTab("dashboard")}
        >
          📊 Tableau de bord
        </button>

        <button
          className={`tab-button ${activeTab === "customization" ? "active" : ""}`}
          onClick={() => setActiveTab("customization")}
        >
          🎨 Personnalisation
        </button>

        <button
          className={`tab-button ${activeTab === "shipping" ? "active" : ""}`}
          onClick={() => setActiveTab("shipping")}
        >
          🚚 Zones de livraison
        </button>

        <button
          className={`tab-button ${activeTab === "email" ? "active" : ""}`}
          onClick={() => setActiveTab("email")}
        >
          ✉️ Notifications email
        </button>

        <button
          className={`tab-button ${activeTab === "orders" ? "active" : ""}`}
          onClick={() => setActiveTab("orders")}
        >
          📦 Commandes
        </button>
      </div>

      <div className="tab-content">
        {activeTab === "dashboard" && (
          <DashboardTab stats={orderStats} orders={orders} />
        )}

        {activeTab === "customization" && (
          <CustomizationTab
            settings={previewSettings}
            setSettings={setPreviewSettings}
            presetThemes={presetThemes}
          />
        )}

        {activeTab === "shipping" && <ShippingTab zones={zones} />}

        {activeTab === "email" && (
          <EmailTab emailSettings={emailSettings} />
        )}

        {activeTab === "orders" && <OrdersTab orders={orders} />}
      </div>
    </div>
  );
}

function DashboardTab({ stats, orders }) {
  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Commandes totales</div>
        </div>

        <div className="stat-card">
          <div className="stat-value">{stats.thisMonth}</div>
          <div className="stat-label">Ce mois</div>
        </div>

        <div className="stat-card">
          <div className="stat-value">
            {Number(stats.totalRevenue || 0).toFixed(0)} DH
          </div>
          <div className="stat-label">Chiffre d'affaires</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: "24px" }}>
        <h3 className="card-title">📋 Commandes récentes</h3>

        {orders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-text">
              Aucune commande pour le moment
            </div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Ville</th>
                <th>Montant</th>
                <th>Date</th>
              </tr>
            </thead>

            <tbody>
              {orders.slice(0, 5).map((order) => (
                <tr key={order.id}>
                  <td>{order.customerName}</td>
                  <td>{order.city}</td>
                  <td>{order.total} DH</td>
                  <td>
                    {new Date(order.createdAt).toLocaleDateString("fr-FR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CustomizationTab({ settings, setSettings, presetThemes }) {
  const safeSettings = settings || DEFAULT_SETTINGS;

  return (
    <Form method="post" className="grid">
      <input type="hidden" name="_action" value="updateSettings" />

      <div className="card">
        <h3 className="card-title">🎨 Thèmes prédéfinis</h3>

        <div className="theme-selector">
          {presetThemes.map((theme) => (
            <div
              key={theme.id}
              className="theme-item"
              onClick={() =>
                setSettings({
                  ...safeSettings,
                  buttonColor: theme.buttonColor,
                  buttonTextColor: theme.textColor
                })
              }
            >
              <div
                className="theme-preview"
                style={{ backgroundColor: theme.buttonColor }}
              ></div>

              <div className="theme-name">{theme.name}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">🔘 Bouton COD</h3>

        <div className="form-group">
          <label className="label">Texte du bouton</label>
          <input
            type="text"
            name="buttonText"
            value={safeSettings.buttonText}
            className="input"
            onChange={(e) =>
              setSettings({
                ...safeSettings,
                buttonText: e.target.value
              })
            }
          />
        </div>

        <div className="form-group">
          <label className="label">Couleur du bouton</label>
          <input
            type="color"
            name="buttonColor"
            value={safeSettings.buttonColor}
            className="color-input"
            onChange={(e) =>
              setSettings({
                ...safeSettings,
                buttonColor: e.target.value
              })
            }
          />
        </div>

        <div className="form-group">
          <label className="label">Couleur du texte</label>
          <input
            type="color"
            name="buttonTextColor"
            value={safeSettings.buttonTextColor}
            className="color-input"
            onChange={(e) =>
              setSettings({
                ...safeSettings,
                buttonTextColor: e.target.value
              })
            }
          />
        </div>

        <div className="form-group">
          <label className="label">Arrondi des coins (0-50)</label>
          <input
            type="number"
            name="borderRadius"
            min="0"
            max="50"
            value={safeSettings.borderRadius}
            className="input"
            onChange={(e) =>
              setSettings({
                ...safeSettings,
                borderRadius: Number(e.target.value)
              })
            }
          />
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">💬 Popup</h3>

        <div className="form-group">
          <label className="label">Titre de la popup</label>
          <input
            type="text"
            name="popupTitle"
            value={safeSettings.popupTitle}
            className="input"
            onChange={(e) =>
              setSettings({
                ...safeSettings,
                popupTitle: e.target.value
              })
            }
          />
        </div>

        <div className="form-group">
          <label className="label">URL page de remerciement</label>
          <input
            type="text"
            name="successPageUrl"
            value={safeSettings.successPageUrl}
            className="input"
            onChange={(e) =>
              setSettings({
                ...safeSettings,
                successPageUrl: e.target.value
              })
            }
          />
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">📋 Champs du formulaire</h3>

        <div className="checkbox-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="showFullName"
              checked={safeSettings.showFullName}
              onChange={(e) =>
                setSettings({
                  ...safeSettings,
                  showFullName: e.target.checked
                })
              }
            />
            Afficher le nom complet
          </label>

          <label className="checkbox-label">
            <input
              type="checkbox"
              name="showPhone"
              checked={safeSettings.showPhone}
              onChange={(e) =>
                setSettings({
                  ...safeSettings,
                  showPhone: e.target.checked
                })
              }
            />
            Afficher le téléphone
          </label>

          <label className="checkbox-label">
            <input
              type="checkbox"
              name="showCity"
              checked={safeSettings.showCity}
              onChange={(e) =>
                setSettings({
                  ...safeSettings,
                  showCity: e.target.checked
                })
              }
            />
            Afficher la ville
          </label>

          <label className="checkbox-label">
            <input
              type="checkbox"
              name="showAddress"
              checked={safeSettings.showAddress}
              onChange={(e) =>
                setSettings({
                  ...safeSettings,
                  showAddress: e.target.checked
                })
              }
            />
            Afficher l'adresse
          </label>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">👁️ Aperçu</h3>

        <div className="preview-section">
          <button
            type="button"
            className="preview-button"
            style={{
              background: safeSettings.buttonColor,
              color: safeSettings.buttonTextColor,
              borderRadius: `${safeSettings.borderRadius}px`
            }}
          >
            {safeSettings.buttonText}
          </button>
        </div>
      </div>

      <div style={{ gridColumn: "1 / -1", marginTop: "16px" }}>
        <button type="submit" className="button button-primary">
          💾 Enregistrer les paramètres
        </button>
      </div>
    </Form>
  );
}

function ShippingTab({ zones }) {
  return (
    <div className="grid">
      <Form method="post" className="card">
        <input type="hidden" name="_action" value="addZone" />

        <h3 className="card-title">➕ Ajouter une zone</h3>

        <div className="form-group">
          <label className="label">Ville/Zone</label>
          <input
            type="text"
            name="zone"
            placeholder="Ex: Casablanca"
            className="input"
            required
          />
        </div>

        <div className="form-group">
          <label className="label">Frais de livraison (DH)</label>
          <input
            type="number"
            name="fee"
            placeholder="35"
            step="0.01"
            className="input"
            required
          />
        </div>

        <div className="form-group">
          <label className="label">Jours estimés (optionnel)</label>
          <input
            type="number"
            name="estimatedDays"
            placeholder="1"
            className="input"
          />
        </div>

        <button type="submit" className="button button-primary">
          ➕ Ajouter
        </button>
      </Form>

      <div className="card">
        <h3 className="card-title">📍 Zones existantes</h3>

        {zones.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-text">Aucune zone configurée</div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Zone</th>
                <th>Frais</th>
                <th>Jours</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {zones.map((zone) => (
                <tr key={zone.id}>
                  <td>{zone.zone}</td>
                  <td>{zone.fee} DH</td>
                  <td>{zone.estimatedDays || "-"}</td>
                  <td>
                    <Form method="post" style={{ display: "inline" }}>
                      <input type="hidden" name="_action" value="deleteZone" />
                      <input type="hidden" name="zoneId" value={zone.id} />

                      <button
                        type="submit"
                        className="button button-danger"
                        style={{ padding: "6px 12px", fontSize: "12px" }}
                      >
                        🗑️
                      </button>
                    </Form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function EmailTab({ emailSettings }) {
  return (
    <Form method="post" className="grid">
      <input type="hidden" name="_action" value="updateEmail" />

      <div className="card">
        <h3 className="card-title">✉️ Configuration email</h3>

        <div className="form-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={emailSettings?.enabled}
            />
            Activer les notifications email
          </label>
        </div>

        <div className="form-group">
          <label className="label">Email de l'expéditeur</label>
          <input
            type="email"
            name="senderEmail"
            defaultValue={emailSettings?.senderEmail || ""}
            placeholder="noreply@alfajr.com"
            className="input"
          />
        </div>

        <div className="form-group">
          <h4 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "12px" }}>
            Destinataires
          </h4>

          <div className="checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="sendToMerchant"
                defaultChecked={emailSettings?.sendToMerchant}
              />
              Envoyer au marchand
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                name="sendToCustomer"
                defaultChecked={emailSettings?.sendToCustomer}
              />
              Envoyer au client
            </label>
          </div>
        </div>

        <button
          type="submit"
          className="button button-primary"
          style={{ marginTop: "16px" }}
        >
          💾 Enregistrer
        </button>
      </div>
    </Form>
  );
}

function OrdersTab({ orders }) {
  return (
    <div className="card">
      <h3 className="card-title">📦 Historique des commandes</h3>

      {orders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">Aucune commande</div>
          <div className="empty-state-text">
            Les commandes apparaîtront ici
          </div>
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Téléphone</th>
              <th>Ville</th>
              <th>Total</th>
              <th>Statut</th>
              <th>Date</th>
            </tr>
          </thead>

          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.customerName}</td>
                <td>{order.customerPhone}</td>
                <td>{order.city}</td>
                <td>{order.total} DH</td>
                <td>
                  <span
                    className={`badge badge-${
                      order.status === "pending" ? "warning" : "success"
                    }`}
                  >
                    {order.status}
                  </span>
                </td>
                <td>
                  {new Date(order.createdAt).toLocaleDateString("fr-FR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}