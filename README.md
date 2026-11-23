# VoltPulse — Bornes & Prix €/kWh

Application web PWA légère (React + TypeScript + Vite) dans le style sombre de **SportApp** pour repérer instantanément les bornes de recharge en France, leurs **prix réels au kWh**, leur **disponibilité en temps réel** et le **coût total détour inclus**.

## Sources de données ouvertes (gratuites, sans clé API)
- **Localisation & caractéristiques IRVE** : [ODRÉ `bornes-irve`](https://odre.opendatasoft.com/explore/dataset/bornes-irve/)
- **Disponibilité temps réel** : [Base nationale consolidée IRVE dynamique (`tabular-api.data.gouv.fr`)](https://tabular-api.data.gouv.fr/api/resources/89185b1f-f958-4c5b-9282-399a66ecee97/data/)
- **Tarifs horaires OCPI en direct** : [QualiCharge OCPI Tarifs (`tabular-api.data.gouv.fr`)](https://tabular-api.data.gouv.fr/api/resources/95b787a1-3c50-4bad-a51c-fa90ccc6661c/data/)
- **Géocodage & itinéraires** : [IGN Géoplateforme](https://data.geopf.fr/) (avec repli OSRM) et tuiles OpenStreetMap

## Développement local
```powershell
npm.cmd install
npm.cmd test
npm.cmd run dev
```

## Déploiement HTTPS (requis pour GPS sur smartphone)
Le navigateur bloque la géolocalisation (`navigator.geolocation`) hors `localhost` si l'application n'est pas servie en **HTTPS**.
- **GitHub Pages** : poussez le dépôt sur GitHub et activez *Settings → Pages → Source: GitHub Actions* ([deploy.yml](.github/workflows/deploy.yml) déploie automatiquement `dist/`).
- **Netlify** : glissez-déposez le dossier `dist/` après `npm run build` ou connectez le dépôt ([netlify.toml](netlify.toml)).
- Installez ensuite la PWA depuis Safari iOS (*Partager → Sur l'écran d'accueil*) ou Chrome Android (*Installer l'application*).
