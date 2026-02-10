# FastAgent Template

Open-source AI app boilerplate with:

- FastAPI backend
- LangChain agent chat endpoints (sync + streaming)
- React + Tailwind + assistant-ui frontend
- Clerk auth ready
- Postgres ready
- MCP ready

## Use this template with Copier

Install Copier:

```bash
pipx install copier
```

Generate a new project:

```bash
copier copy . ../my-fastagent-app
```

Or from GitHub:

```bash
copier copy gh:mahimailabs/fastagent my-fastagent-app
```

## Maintainer Notes

- Template config: `/Users/mahimai/code/year-2026/JAN/fastagent/copier.yml`
- Templated files use `.jinja` suffix:
  - `/Users/mahimai/code/year-2026/JAN/fastagent/README.md.jinja`
  - `/Users/mahimai/code/year-2026/JAN/fastagent/backend/.env.example.jinja`
  - `/Users/mahimai/code/year-2026/JAN/fastagent/frontend/.env.example.jinja`
  - `/Users/mahimai/code/year-2026/JAN/fastagent/backend/pyproject.toml.jinja`
