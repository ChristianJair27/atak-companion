# ATAK Coach (IA local con Ollama)

El companion analiza el draft con IA y devuelve runas/items/hechizos **para esa partida**.

Orden de proveedores:
1. **Claude** si existe `ANTHROPIC_API_KEY` (modelo `ATAK_CLAUDE_MODEL`, por defecto `claude-sonnet-5-5`).
2. **Ollama local** con el modelo `atak-coach` (este Modelfile). Si no existe, usa `OLLAMA_MODEL` (por defecto `llama3.1:8b`).
3. Sin IA: build del matchup OP.GG + reglas por composición.

Crear o actualizar el modelo:

```bash
npm run ai:setup
```

Variables útiles: `OLLAMA_URL` (por defecto `http://localhost:11434/api/chat`), `ATAK_OLLAMA_MODEL` (por defecto `atak-coach`).
