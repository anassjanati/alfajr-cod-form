import { useLoaderData, Form, useActionData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import "../styles/premium.css";
import { useState } from "react";
import {
  encryptMetaAccessToken,
  publicMetaSettings,
  validateMetaPixelId,
} from "../Services/meta-settings.service";

const DEFAULT_SETTINGS = {
  buttonText: "Commander en paiement à la livraison",
  buttonColor: "#0D47C7",
  buttonTextColor: "#FFFFFF",
  borderRadius: 14,
  buttonWidth: "100%",
  buttonIcon: "🚚",

  formTheme: "premium",
  formBackgroundColor: "#FFFFFF",
  formTextColor: "#111827",
  formBorderColor: "#E5E7EB",
  formAccentColor: "#0D47C7",

  popupTitle: "Commande rapide",
  successPageUrl: "/pages/merci-commande",

  showFullName: true,
  showPhone: true,
  showCity: true,
  showAddress: true,
  showQuantity: true,
  showEmail: false,
  showNotes: false,

  customCss: ""
};

async function saveSettingsToShopifyMetafield(admin, settings) {
  const response = await admin.graphql(`
    query {
      currentAppInstallation {
        id
      }
    }
  `);

  const json = await response.json();
  const appInstallationId = json?.data?.currentAppInstallation?.id;

  if (!appInstallationId) {
    throw new Error("App installation ID not found");
  }

  const metafieldResponse = await admin.graphql(
    `
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
  `,
    {
      variables: {
        metafields: [
          {
            ownerId: appInstallationId,
            namespace: "cod_settings",
            key: "theme",
            type: "json",
            value: JSON.stringify(settings)
          }
        ]
      }
    }
  );

  const metafieldJson = await metafieldResponse.json();
  const errors = metafieldJson?.data?.metafieldsSet?.userErrors || [];

  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.message).join(", "));
  }
}

async function saveShippingZonesToShopifyMetafield(admin, zones) {
  const response = await admin.graphql(`
    query { currentAppInstallation { id } }
  `);
  const json = await response.json();
  const appInstallationId = json?.data?.currentAppInstallation?.id;

  if (!appInstallationId) return;

  const formattedZones = zones.map(z => ({
    zone: z.zone,
    fee: z.fee
  }));

  await admin.graphql(
    `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { message }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId: appInstallationId,
            namespace: "cod_settings",
            key: "shipping",
            type: "json",
            value: JSON.stringify(formattedZones)
          }
        ]
      }
    }
  );
}

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let settings = await prisma.codSettings.findUnique({ where: { shop } });

  if (!settings) {
    settings = await prisma.codSettings.create({
      data: { shop, ...DEFAULT_SETTINGS }
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

  const [zones, orders, storedMetaSettings] = await Promise.all([
    prisma.shippingZone.findMany({
      where: { shop },
      orderBy: { zone: "asc" }
    }),
    prisma.codOrder.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 50
    }),
    prisma.metaTrackingSettings.findUnique({ where: { shop } })
  ]);

  const totalRevenueResult = await prisma.codOrder.aggregate({
    where: { shop },
    _sum: { total: true }
  });

  const orderStats = {
    total: await prisma.codOrder.count({ where: { shop } }),
    thisMonth: await prisma.codOrder.count({
      where: {
        shop,
        createdAt: { gte: new Date(new Date().setDate(1)) }
      }
    }),
    totalRevenue: totalRevenueResult._sum.total || 0
  };

  return {
    settings,
    zones,
    orders,
    emailSettings,
    metaSettings: publicMetaSettings(storedMetaSettings),
    orderStats
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
        buttonText: formData.get("buttonText") || DEFAULT_SETTINGS.buttonText,
        buttonColor: formData.get("buttonColor") || DEFAULT_SETTINGS.buttonColor,
        buttonTextColor:
          formData.get("buttonTextColor") || DEFAULT_SETTINGS.buttonTextColor,
        borderRadius:
          Number(formData.get("borderRadius")) || DEFAULT_SETTINGS.borderRadius,
        buttonWidth: formData.get("buttonWidth") || DEFAULT_SETTINGS.buttonWidth,
        buttonIcon: formData.get("buttonIcon") || DEFAULT_SETTINGS.buttonIcon,

        formTheme: formData.get("formTheme") || DEFAULT_SETTINGS.formTheme,
        formBackgroundColor:
          formData.get("formBackgroundColor") ||
          DEFAULT_SETTINGS.formBackgroundColor,
        formTextColor:
          formData.get("formTextColor") || DEFAULT_SETTINGS.formTextColor,
        formBorderColor:
          formData.get("formBorderColor") || DEFAULT_SETTINGS.formBorderColor,
        formAccentColor:
          formData.get("formAccentColor") || DEFAULT_SETTINGS.formAccentColor,

        popupTitle: formData.get("popupTitle") || DEFAULT_SETTINGS.popupTitle,
        successPageUrl:
          formData.get("successPageUrl") || DEFAULT_SETTINGS.successPageUrl,

        showFullName: formData.get("showFullName") === "on",
        showPhone: formData.get("showPhone") === "on",
        showCity: formData.get("showCity") === "on",
        showAddress: formData.get("showAddress") === "on",
        showQuantity: formData.get("showQuantity") === "on",
        showEmail: formData.get("showEmail") === "on",
        showNotes: formData.get("showNotes") === "on",

        customCss: formData.get("customCss") || ""
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
        message: "Paramètres enregistrés et synchronisés avec la boutique"
      };
    }

    if (actionType === "updateMeta") {
      const existing = await prisma.metaTrackingSettings.findUnique({
        where: { shop }
      });
      const enabled = formData.get("enabled") === "on";
      const browserPixelEnabled =
        formData.get("browserPixelEnabled") === "on";
      const pixelId = String(formData.get("pixelId") || "").trim();
      const newAccessToken = String(
        formData.get("accessToken") || ""
      ).trim();
      const clearAccessToken = formData.get("clearAccessToken") === "on";
      const testEventCode = String(
        formData.get("testEventCode") || ""
      ).trim();

      if (pixelId && !validateMetaPixelId(pixelId)) {
        return {
          success: false,
          message: "Le Pixel ID doit contenir uniquement des chiffres."
        };
      }

      let accessTokenEncrypted = clearAccessToken
        ? null
        : existing?.accessTokenEncrypted || null;

      if (newAccessToken) {
        accessTokenEncrypted = encryptMetaAccessToken(newAccessToken);
      }

      if (enabled && (!pixelId || !accessTokenEncrypted)) {
        return {
          success: false,
          message: "Ajoutez le Pixel ID et le token Conversions API avant d’activer Meta."
        };
      }

      await prisma.metaTrackingSettings.upsert({
        where: { shop },
        update: {
          enabled,
          pixelId: pixelId || null,
          accessTokenEncrypted,
          browserPixelEnabled,
          testEventCode: testEventCode || null,
          lastEventStatus: enabled ? existing?.lastEventStatus : "disabled",
          lastEventError: enabled ? existing?.lastEventError : null
        },
        create: {
          shop,
          enabled,
          pixelId: pixelId || null,
          accessTokenEncrypted,
          browserPixelEnabled,
          testEventCode: testEventCode || null
        }
      });

      return {
        success: true,
        message: enabled
          ? "Meta Pixel et Conversions API activés pour cette boutique"
          : "Suivi Meta désactivé pour cette boutique"
      };
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

      const updatedZones = await prisma.shippingZone.findMany({ where: { shop } });
      await saveShippingZonesToShopifyMetafield(admin, updatedZones);

      return { success: true, message: "Zone de livraison ajoutée" };
    }

    if (actionType === "deleteZone") {
      await prisma.shippingZone.delete({
        where: { id: Number(formData.get("zoneId")) }
      });

      const updatedZones = await prisma.shippingZone.findMany({ where: { shop } });
      await saveShippingZonesToShopifyMetafield(admin, updatedZones);

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
    zones,
    orders,
    emailSettings,
    metaSettings,
    orderStats
  } = useLoaderData();
  const actionData = useActionData();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [previewSettings, setPreviewSettings] = useState(
    settings || DEFAULT_SETTINGS
  );

  return (
    <div className="app-layout">
      {/* 🚀 السايدبار الجديد 🚀 */}
      <aside className="sidebar">
        <div className="logo-area">
          <h3>AL FAJR COD</h3>
          <span>Express</span>
        </div>
        <nav className="nav-menu">
          {[
            { id: "dashboard", label: "📊 Tableau de bord" },
            { id: "customization", label: "🎨 Form Builder" },
            { id: "shipping", label: "🚚 Livraison" },
            { id: "email", label: "✉️ Notifications" },
            { id: "meta", label: "📈 Meta Pixel" },
            { id: "orders", label: "📦 Commandes" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-link ${activeTab === item.id ? "active" : ""}`}
              onClick={() => setActiveTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* 🚀 المحتوى الرئيسي 🚀 */}
      <main className="main-content">
        <div className="header-bar">
          <h1 className="header-title">
            {activeTab === "dashboard" && "Tableau de bord"}
            {activeTab === "customization" && "Personnalisation du Formulaire"}
            {activeTab === "shipping" && "Gestion de la Livraison"}
            {activeTab === "email" && "Notifications par Email"}
            {activeTab === "meta" && "Meta Pixel & Conversions API"}
            {activeTab === "orders" && "Historique des Commandes"}
          </h1>
          <p className="header-subtitle">Application professionnelle pour gérer les commandes COD au maroc.</p>
        </div>

        {actionData?.success && (
          <div className="alert alert-success">✓ {actionData.message}</div>
        )}

        {actionData?.success === false && (
          <div className="alert alert-error">✗ {actionData.message}</div>
        )}

        <div className="tab-content">
          {activeTab === "dashboard" && <DashboardTab stats={orderStats} orders={orders} />}
          {activeTab === "customization" && <CustomizationTab settings={previewSettings} setSettings={setPreviewSettings} />}
          {activeTab === "shipping" && <ShippingTab zones={zones} />}
          {activeTab === "email" && <EmailTab emailSettings={emailSettings} />}
          {activeTab === "meta" && <MetaTrackingTab metaSettings={metaSettings} />}
          {activeTab === "orders" && <OrdersTab orders={orders} />}
        </div>
      </main>
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
            <div className="empty-state-text">Aucune commande pour le moment</div>
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
                  <td>{new Date(order.createdAt).toLocaleDateString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CustomizationTab({ settings, setSettings }) {
  const safeSettings = settings || DEFAULT_SETTINGS;

  const applyTheme = (themeName) => {
    const themes = {
      premium: {
        formTheme: "premium",
        buttonColor: "#0D47C7",
        buttonTextColor: "#FFFFFF",
        formBackgroundColor: "#FFFFFF",
        formTextColor: "#111827",
        formBorderColor: "#E5E7EB",
        formAccentColor: "#0D47C7",
        borderRadius: 14
      },
      minimal: {
        formTheme: "minimal",
        buttonColor: "#111827",
        buttonTextColor: "#FFFFFF",
        formBackgroundColor: "#FFFFFF",
        formTextColor: "#111827",
        formBorderColor: "#E5E7EB",
        formAccentColor: "#111827",
        borderRadius: 10
      },
      glass: {
        formTheme: "glass",
        buttonColor: "#0D47C7",
        buttonTextColor: "#FFFFFF",
        formBackgroundColor: "rgba(255,255,255,0.72)",
        formTextColor: "#111827",
        formBorderColor: "rgba(255,255,255,0.45)",
        formAccentColor: "#0D47C7",
        borderRadius: 22
      },
      dark: {
        formTheme: "dark",
        buttonColor: "#FFC928",
        buttonTextColor: "#111827",
        formBackgroundColor: "#111827",
        formTextColor: "#FFFFFF",
        formBorderColor: "#374151",
        formAccentColor: "#FFC928",
        borderRadius: 16
      }
    };

    setSettings({
      ...safeSettings,
      ...themes[themeName]
    });
  };

  return (
    <Form method="post" className="grid">
      <input type="hidden" name="_action" value="updateSettings" />
      <input type="hidden" name="formTheme" value={safeSettings.formTheme} />

      <div className="card">
        <h3 className="card-title">⚡ Style rapide</h3>

        <div className="theme-selector">
          <button type="button" className="theme-item" onClick={() => applyTheme("premium")}>
            <div className="theme-preview" style={{ background: "#0D47C7" }} />
            <div className="theme-name">Premium</div>
          </button>

          <button type="button" className="theme-item" onClick={() => applyTheme("minimal")}>
            <div className="theme-preview" style={{ background: "#111827" }} />
            <div className="theme-name">Minimal</div>
          </button>

          <button type="button" className="theme-item" onClick={() => applyTheme("glass")}>
            <div
              className="theme-preview"
              style={{ background: "linear-gradient(135deg,#E0F2FE,#FFFFFF)" }}
            />
            <div className="theme-name">Glass Apple</div>
          </button>

          <button type="button" className="theme-item" onClick={() => applyTheme("dark")}>
            <div className="theme-preview" style={{ background: "#111827" }} />
            <div className="theme-name">Dark</div>
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">🔘 Bouton COD</h3>

        <div className="form-group">
          <label className="label">Icône du bouton</label>
          <input
            type="text"
            name="buttonIcon"
            value={safeSettings.buttonIcon}
            className="input"
            onChange={(e) => setSettings({ ...safeSettings, buttonIcon: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label className="label">Texte du bouton</label>
          <input
            type="text"
            name="buttonText"
            value={safeSettings.buttonText}
            className="input"
            onChange={(e) => setSettings({ ...safeSettings, buttonText: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label className="label">Largeur du bouton</label>
          <select
            name="buttonWidth"
            value={safeSettings.buttonWidth}
            className="input"
            onChange={(e) => setSettings({ ...safeSettings, buttonWidth: e.target.value })}
          >
            <option value="100%">100% pleine largeur</option>
            <option value="auto">Auto</option>
            <option value="80%">80%</option>
            <option value="60%">60%</option>
          </select>
        </div>

        <div className="form-group">
          <label className="label">Couleur du bouton</label>
          <input
            type="color"
            name="buttonColor"
            value={safeSettings.buttonColor}
            className="color-input"
            onChange={(e) => setSettings({ ...safeSettings, buttonColor: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label className="label">Couleur du texte</label>
          <input
            type="color"
            name="buttonTextColor"
            value={safeSettings.buttonTextColor}
            className="color-input"
            onChange={(e) => setSettings({ ...safeSettings, buttonTextColor: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label className="label">Arrondi des coins</label>
          <input
            type="number"
            name="borderRadius"
            min="0"
            max="50"
            value={safeSettings.borderRadius}
            className="input"
            onChange={(e) =>
              setSettings({ ...safeSettings, borderRadius: Number(e.target.value) })
            }
          />
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">🧊 Style du formulaire</h3>

        <div className="form-group">
          <label className="label">Fond du formulaire</label>
          <input
            type="text"
            name="formBackgroundColor"
            value={safeSettings.formBackgroundColor}
            className="input"
            placeholder="#FFFFFF ou rgba(255,255,255,.72)"
            onChange={(e) =>
              setSettings({ ...safeSettings, formBackgroundColor: e.target.value })
            }
          />
        </div>

        <div className="form-group">
          <label className="label">Couleur du texte</label>
          <input
            type="color"
            name="formTextColor"
            value={safeSettings.formTextColor}
            className="color-input"
            onChange={(e) =>
              setSettings({ ...safeSettings, formTextColor: e.target.value })
            }
          />
        </div>

        <div className="form-group">
          <label className="label">Couleur des bordures</label>
          <input
            type="text"
            name="formBorderColor"
            value={safeSettings.formBorderColor}
            className="input"
            onChange={(e) =>
              setSettings({ ...safeSettings, formBorderColor: e.target.value })
            }
          />
        </div>

        <div className="form-group">
          <label className="label">Couleur accent</label>
          <input
            type="color"
            name="formAccentColor"
            value={safeSettings.formAccentColor}
            className="color-input"
            onChange={(e) =>
              setSettings({ ...safeSettings, formAccentColor: e.target.value })
            }
          />
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">📋 Champs du formulaire</h3>

        <div className="checkbox-group">
          {[
            ["showFullName", "Nom complet"],
            ["showPhone", "Téléphone"],
            ["showCity", "Ville"],
            ["showAddress", "Adresse"],
            ["showQuantity", "Quantité"],
            ["showEmail", "Email"],
            ["showNotes", "Notes client"]
          ].map(([key, label]) => (
            <label className="checkbox-label" key={key}>
              <input
                type="checkbox"
                name={key}
                checked={Boolean(safeSettings[key])}
                onChange={(e) =>
                  setSettings({ ...safeSettings, [key]: e.target.checked })
                }
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">💬 Popup & Thank You</h3>

        <div className="form-group">
          <label className="label">Titre de la popup</label>
          <input
            type="text"
            name="popupTitle"
            value={safeSettings.popupTitle}
            className="input"
            onChange={(e) => setSettings({ ...safeSettings, popupTitle: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label className="label">URL page merci</label>
          <input
            type="text"
            name="successPageUrl"
            value={safeSettings.successPageUrl}
            className="input"
            onChange={(e) =>
              setSettings({ ...safeSettings, successPageUrl: e.target.value })
            }
          />
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">👁️ Aperçu client</h3>

        <div
          className={`preview-section preview-${safeSettings.formTheme}`}
          style={{
            background: safeSettings.formBackgroundColor,
            color: safeSettings.formTextColor,
            borderColor: safeSettings.formBorderColor,
            borderRadius: `${safeSettings.borderRadius + 8}px`
          }}
        >
          <button
            type="button"
            className="preview-button"
            style={{
              width: safeSettings.buttonWidth,
              background: safeSettings.buttonColor,
              color: safeSettings.buttonTextColor,
              borderRadius: `${safeSettings.borderRadius}px`
            }}
          >
            {safeSettings.buttonIcon} {safeSettings.buttonText}
          </button>

          <div style={{ marginTop: 16, textAlign: "left", fontWeight: 800 }}>
            {safeSettings.popupTitle}
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            <div className="input">Nom complet</div>
            <div className="input">Téléphone</div>
            <div className="input">Ville</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <h3 className="card-title">🧩 CSS personnalisé</h3>

        <div className="form-group">
          <label className="label">Advanced Custom CSS</label>
          <textarea
            name="customCss"
            value={safeSettings.customCss}
            className="textarea"
            rows="8"
            placeholder=".alfajr-product-modal-content { backdrop-filter: blur(30px); }"
            onChange={(e) => setSettings({ ...safeSettings, customCss: e.target.value })}
          />
        </div>
      </div>

      <div style={{ gridColumn: "1 / -1" }}>
        <button type="submit" className="button button-primary">
          💾 Enregistrer et synchroniser avec la boutique
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
          <label className="label">Jours estimés</label>
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

function MetaTrackingTab({ metaSettings }) {
  const settings = metaSettings || {};
  const lastEventDate = settings.lastEventAt
    ? new Date(settings.lastEventAt).toLocaleString("fr-FR")
    : "Aucun événement envoyé";

  return (
    <Form method="post" className="grid">
      <input type="hidden" name="_action" value="updateMeta" />

      <div className="card">
        <h3 className="card-title">📈 Connexion Meta</h3>

        <div className="meta-status-row">
          <span
            className={`meta-status-dot ${settings.enabled ? "is-active" : ""}`}
            aria-hidden="true"
          />
          <strong>{settings.enabled ? "Suivi actif" : "Suivi désactivé"}</strong>
        </div>

        <div className="form-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={settings.enabled}
            />
            Activer les événements Purchase Meta
          </label>
        </div>

        <div className="form-group">
          <label className="label">Meta Pixel ID</label>
          <input
            type="text"
            inputMode="numeric"
            name="pixelId"
            defaultValue={settings.pixelId || ""}
            placeholder="Ex. 123456789012345"
            className="input"
            autoComplete="off"
          />
          <p className="help-text">
            Disponible dans Meta Events Manager → Sources de données.
          </p>
        </div>

        <div className="form-group">
          <label className="label">Token Conversions API</label>
          <input
            type="password"
            name="accessToken"
            placeholder={
              settings.hasAccessToken
                ? "Token déjà enregistré — laisser vide pour le conserver"
                : "Collez le token généré par Meta"
            }
            className="input"
            autoComplete="new-password"
          />
          <p className="help-text">
            Le token est chiffré dans la base de données et n’est jamais envoyé au navigateur.
          </p>
        </div>

        {settings.hasAccessToken && (
          <div className="form-group">
            <label className="checkbox-label checkbox-danger">
              <input type="checkbox" name="clearAccessToken" />
              Supprimer le token enregistré
            </label>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="card-title">⚙️ Options d’envoi</h3>

        <div className="form-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="browserPixelEnabled"
              defaultChecked={settings.browserPixelEnabled !== false}
            />
            Envoyer aussi Purchase depuis le navigateur
          </label>
          <p className="help-text">
            Recommandé avec le serveur. Les deux événements utilisent le même Event ID pour la déduplication.
          </p>
        </div>

        <div className="form-group">
          <label className="label">Code Test Event Meta</label>
          <input
            type="text"
            name="testEventCode"
            defaultValue={settings.testEventCode || ""}
            placeholder="Optionnel — seulement pendant les tests"
            className="input"
            autoComplete="off"
          />
          <p className="help-text">
            Supprimez ce code après le test afin que les commandes soient traitées comme événements de production.
          </p>
        </div>

        <div className="meta-delivery-status">
          <div>
            <span className="meta-status-label">Dernier statut</span>
            <strong>{settings.lastEventStatus || "Non testé"}</strong>
          </div>
          <div>
            <span className="meta-status-label">Dernier envoi</span>
            <strong>{lastEventDate}</strong>
          </div>
        </div>

        {settings.lastEventError && (
          <div className="alert alert-error meta-error-box">
            Dernière erreur Meta enregistrée. Vérifiez le Pixel ID, le token et le code de test.
          </div>
        )}
      </div>

      <div style={{ gridColumn: "1 / -1" }}>
        <button type="submit" className="button button-primary">
          💾 Enregistrer la configuration Meta
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
          <div className="empty-state-text">Les commandes apparaîtront ici</div>
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
                <td>{new Date(order.createdAt).toLocaleDateString("fr-FR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}