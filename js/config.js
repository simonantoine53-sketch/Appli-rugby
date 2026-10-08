/* Configuration du backend (Supabase). La clé « publishable » est publique par conception :
   les données sont protégées par les politiques RLS côté base. Laissez les deux champs vides
   pour un fonctionnement 100 % local (dessins stockés dans le navigateur, sans compte). */
window.RUGBY_CONFIG = {
  supabaseUrl: 'https://rnbsupogbesfngjfykyc.supabase.co',
  supabaseKey: 'sb_publishable_JtiH_AF7CbToELN6OAupew_oo9sn5gL'
};
