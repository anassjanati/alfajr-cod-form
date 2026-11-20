import { flatRoutes } from "@react-router/fs-routes";

export default flatRoutes({
  ignoredRouteFiles: ["**/*.test.{js,jsx,ts,tsx}", "**/*.spec.{js,jsx,ts,tsx}"],
});
