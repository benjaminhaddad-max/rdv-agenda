# Configuration LiveKit (visioconférence native)

Les RDV en visio passent désormais par **LiveKit** au lieu de Jitsi public.
Les liens ont la forme `https://crm.diplomasante.com/visio/rdv-xxxxxxxx`
au lieu de `https://meet.jit.si/rdv-xxxxxxxx`.

## 2 options d'hébergement

### Option A — Self-hosted sur Hetzner (recommandé, ~13€/mois illimité)

#### 1. Crée un VPS Hetzner

- Va sur [hetzner.com/cloud](https://www.hetzner.com/cloud)
- Crée un **Cloud Server CX22** (4€/mois) ou **CX32** (~10€/mois) pour plus de marge
- Region : **Falkenstein (Allemagne)** ou Nuremberg
- Image : **Ubuntu 22.04**
- SSH key : ajoute la tienne (génère-en une avec `ssh-keygen` si besoin)

#### 2. Configure le DNS

Dans ton registrar (Cloudflare, OVH, etc.), ajoute un A record :
```
livekit.diplomasante.com   →   <IP-publique-du-VPS>
```

#### 3. Installe Docker + LiveKit sur le VPS

```bash
ssh root@<IP-VPS>

# Docker
curl -fsSL https://get.docker.com | sh

# Crée le dossier de config
mkdir -p /opt/livekit && cd /opt/livekit
```

Crée `/opt/livekit/livekit.yaml` :
```yaml
port: 7880
bind_addresses:
  - ""
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
keys:
  # Génère une clé/secret robustes — voir étape 4 plus bas
  APIxxxxxxxxxxx: "secretxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

#### 4. Génère les clés API LiveKit

```bash
docker run --rm livekit/livekit-cli:latest create-token --help
# OU plus simple, génère manuellement :
echo "API$(openssl rand -hex 6)"
echo "$(openssl rand -hex 32)"
```

Mets ces 2 valeurs dans `livekit.yaml` (la 1ère est la clé publique `API...`,
la 2ème est le secret).

#### 5. Lance LiveKit

```bash
docker run -d \
  --name livekit \
  --restart unless-stopped \
  --network host \
  -v /opt/livekit/livekit.yaml:/etc/livekit.yaml \
  livekit/livekit-server \
  --config /etc/livekit.yaml
```

#### 6. Reverse proxy + TLS (Caddy)

```bash
apt install -y caddy
```

Crée `/etc/caddy/Caddyfile` :
```
livekit.diplomasante.com {
    reverse_proxy localhost:7880
}
```

```bash
systemctl reload caddy
```

Caddy gère automatiquement le certif Let's Encrypt.

#### 7. Ouvre les ports firewall

Dans le panneau Hetzner Cloud → Firewalls :
- TCP : 22 (SSH), 80, 443, 7880, 7881
- UDP : 50000–60000

#### 8. Test

Depuis ton Mac :
```bash
curl https://livekit.diplomasante.com
# Doit répondre "OK" ou similaire
```

---

### Option B — LiveKit Cloud (gratuit pour tester, payant au-delà)

- Va sur [livekit.io/cloud](https://livekit.io/cloud)
- Crée un compte
- Crée un projet → tu auras :
  - `wss://xxx.livekit.cloud` (URL serveur)
  - `APIxxx` (clé)
  - Secret

Gratuit jusqu'à 50 min/participant/mois ensuite ~0.004$/min.

---

## Configuration côté Vercel (les 2 options)

Va dans **Vercel Dashboard → ton projet → Settings → Environment Variables**
et ajoute :

| Variable | Valeur |
|---|---|
| `LIVEKIT_URL` | `wss://livekit.diplomasante.com` (Hetzner) ou `wss://xxx.livekit.cloud` (Cloud) |
| `NEXT_PUBLIC_LIVEKIT_URL` | même valeur que `LIVEKIT_URL` (pour le client) |
| `LIVEKIT_API_KEY` | la clé `APIxxx` |
| `LIVEKIT_API_SECRET` | le secret |
| `NEXT_PUBLIC_APP_URL` | `https://crm.diplomasante.com` (ou ton domaine) |

Puis **redéploie** pour que les variables soient prises en compte.

## Test

1. Va sur `/admin/crm`, ouvre une fiche contact, clique sur "Prendre un RDV"
2. Choisis **Visio** → un lien `https://crm.diplomasante.com/visio/rdv-xxxx` est généré
3. Ouvre ce lien dans un onglet privé → l'écran PreJoin s'affiche
4. Mets ton prénom, autorise micro+caméra, clique "Rejoindre"
5. Tu rejoins la room. Ouvre le même lien dans un autre navigateur (ou un autre appareil) → tu vois les 2 participants

## Avantages de ce setup

- ✅ URL sur ton domaine (`crm.diplomasante.com/visio/...`)
- ✅ Marque blanche (pas de branding tiers)
- ✅ Coût fixe (Hetzner ~13€/mois illimité)
- ✅ Confidentialité (données restent sur ton infra)
- ✅ Connexion en 1 clic depuis le mail/SMS envoyé au lead
- ✅ Composant prefab LiveKit : grid, contrôles audio/vidéo, partage d'écran, chat — tout inclus

## Si tu changes d'avis

Tu peux toujours revenir à Jitsi public en remettant l'ancienne fonction
`generateJitsiLink` (URL `https://meet.jit.si/rdv-xxx`). Le code est sauvegardé
dans Git.
