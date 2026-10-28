import urllib.request, json
req = urllib.request.Request('https://api.github.com/repos/alimehr755-byte/canopy-engine/actions/runs?per_page=3', headers={'Accept': 'application/vnd.github+json'})
data = json.load(urllib.request.urlopen(req))
for r in data.get('workflow_runs', []):
    print(f"{r['name']}: {r['status']} / {r['conclusion'] or 'running'} - {r['html_url']}")