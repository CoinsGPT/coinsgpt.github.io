---
description: How to create add images in markdown file.
---

# Remove version

To remove a version of versioned documentation in Docusaurus, follow these steps:

## Steps to Remove a Version in Docusaurus

1. **Update the `versions.json` File**:
   - Open the `versions.json` file in the root of your project.
   - Remove the entry corresponding to the version you deleted.

   Example `versions.json` before:
   ```json
   [
     "1.0.0",
     "2.0.0",
     "3.0.0"
   ]
   ```

   After removing version `2.0.0`:
   ```json
   [
     "1.0.0",
     "3.0.0"
   ]
   ```

2. **Optional: Locate the Versioned Documentation Folder**:
   - Versioned documentation is usually stored under the `versioned_docs` and `versioned_sidebars` directories in the root of your project.

   Example structure:
   ```
   versioned_docs/
   ├── version-1.0.0/
   ├── version-2.0.0/
   └── version-3.0.0/
   versioned_sidebars/
   ├── version-1.0.0-sidebars.json
   ├── version-2.0.0-sidebars.json
   └── version-3.0.0-sidebars.json
   ```

3. **Optional: Delete the Versioned Files**:
   - Identify the version you want to remove (e.g., `version-2.0.0`).
   - Delete the corresponding folder in the `versioned_docs` directory and its sidebar file in the `versioned_sidebars` directory.

   Example:
   ```
   rm -rf versioned_docs/version-2.0.0
   rm versioned_sidebars/version-2.0.0-sidebars.json
   ```


4. **Optional: Verify Links and References**:
   - Check your project for any references to the removed version (e.g., in `docusaurus.config.js` or custom navigation menus).
   - Remove or update those references to prevent broken links.
---

### Additional Notes
- Be cautious while removing a version, as it permanently deletes the associated files.
- If you want to archive the version instead of deleting it, consider moving the files to a backup directory.
