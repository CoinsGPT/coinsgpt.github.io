---
description: How to adapt home page quickly.
---

# Remove language translation

To remove a language for translation in Docusaurus, you need to update the internationalization (i18n) configuration and clean up any related translation files. Here's how you can do it:

---

### Steps to Remove a Language in Docusaurus

1. **Locate the `docusaurus.config.js` File**:
   - This file contains the Docusaurus configuration, including the `i18n` settings.

2. **Remove the Language from the `locales` Array**:
   - Open the `docusaurus.config.js` file.
   - In the `i18n` section, remove the language code of the language you want to delete.

   Example:
   ```javascript
    i18n: {
      defaultLocale,

      locales:
        isDeployPreview || isBranchDeploy
          ? // Deploy preview and branch deploys: keep them fast!
            [defaultLocale]
          : isI18nStaging
          ? // Staging locales: https://docusaurus-i18n-staging.netlify.app/
            [defaultLocale, 'ja']
          : // Production locales
            [defaultLocale, 'fr', 'pt-BR', 'ko', 'zh-CN'],
    },
   ```

3. **Optional: Delete the Translation Files**:
   - Navigate to the `i18n` directory in your project root.
   - Locate and delete the folder corresponding to the language you want to remove.

   Example:
   ```
   i18n/
   ├── en/
   ├── fr/
   └── zh/   <-- Delete this folder if you're removing Chinese ('zh')
   ```

4. **Optional: Update Any Additional References**:
   - Check your project files for any hardcoded references to the removed language (e.g., links, language selectors, or custom scripts).
   - Remove or update those references.


---

### Notes
- Removing a language does not affect the defaultLocale or other remaining languages.
- Be careful when removing translation files, as they cannot be restored unless you have a backup.
