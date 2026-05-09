const fs = require('node:fs/promises');
const path = require('node:path');

class PropertyRegistry {
  constructor({ baseDir }) {
    this.baseDir = baseDir;
    this.byId = new Map();
    this.byType = new Map();
  }

  async loadAll() {
    this.byId.clear();
    this.byType.clear();

    let entries = [];
    try {
      entries = await fs.readdir(this.baseDir, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') {
        return;
      }
      throw error;
    }

    const typeDirs = entries.filter((entry) => entry.isDirectory());
    for (const typeDir of typeDirs) {
      const type = typeDir.name;
      const typePath = path.join(this.baseDir, type);
      const files = await fs.readdir(typePath, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile() || path.extname(file.name) !== '.json') {
          continue;
        }
        const filePath = path.join(typePath, file.name);
        const raw = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        const id = parsed.id || path.basename(file.name, '.json');
        const record = { ...parsed, id, type };
        this.byId.set(id, record);

        if (!this.byType.has(type)) {
          this.byType.set(type, new Map());
        }
        this.byType.get(type).set(id, record);
      }
    }
  }

  get(id) {
    return this.byId.get(id) || null;
  }

  getByType(type, id) {
    return this.byType.get(type)?.get(id) || null;
  }

  listByType(type) {
    return Array.from(this.byType.get(type)?.values() || []);
  }
}

module.exports = {
  PropertyRegistry,
};
