// Demo data transcribed from "Menu Selection Link.dc.html" (the Claude Design
// mockup). Used only when the page is opened without a share token, so the
// redesign can be previewed standalone exactly like the design canvas.

export const DEMO_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DEMO_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DEMO_WEEK_START = '2026-08-17';
export const DEMO_MENU_NAME = 'Week 34 – Fresh & Green';
export const DEMO_MENU_RANGE = 'Mon, Aug 17 – Sun, Aug 23 · closes Friday 18:00';

const meal = (id, day, type, name, sub, allergens, exclusions) => ({
  id, day, type, name, sub, allergens, exclusions,
});

export const DEMO_MEALS = [
  meal('m1', 0, 'breakfast', 'Carrot cake pancake', 'Oats, carrot, walnut, maple · 320 kcal', ['Gluten', 'Nuts', 'Eggs'], []),
  meal('m2', 0, 'breakfast', 'Berry chia pot', 'Chia, coconut yoghurt, berries · 240 kcal', [], ['Vegan']),
  meal('m3', 0, 'lunch', 'Grilled lemon chicken', 'Chicken, basmati rice, broccoli · 520 kcal', [], []),
  meal('m4', 0, 'lunch', 'Baked chicken ziti', 'Chicken, ziti, tomato, mozzarella · 610 kcal', ['Gluten', 'Dairy'], []),
  meal('m5', 0, 'dinner', 'Ginger soy salmon', 'Salmon, jasmine rice, bok choy · 540 kcal', ['Fish', 'Soy'], []),
  meal('m25', 0, 'lunch', 'Smoked pork carbonara', 'Pork belly, pancetta, egg yolk, pecorino · 640 kcal', ['Gluten', 'Eggs', 'Dairy'], ['No pork']),
  meal('m26', 0, 'dinner', 'Braised beef short rib', 'Beef short rib, red wine, mash · 660 kcal', ['Dairy'], ['No beef']),
  meal('m27', 0, 'dinner', 'Paneer butter masala', 'Paneer, cream, tomato, naan · 580 kcal', ['Dairy', 'Gluten'], ['Vegan', 'Vegetarian']),
  meal('m6', 1, 'breakfast', 'French toast', 'Brioche, cinnamon, berries · 380 kcal', ['Gluten', 'Eggs', 'Dairy'], []),
  meal('m7', 1, 'lunch', 'Chickpea tagine', 'Chickpea, apricot, couscous · 470 kcal', ['Gluten'], ['Vegan']),
  meal('m8', 1, 'lunch', 'Herb-crusted cod', 'Cod, sweet potato, spinach · 490 kcal', ['Fish', 'Gluten'], []),
  meal('m9', 1, 'dinner', 'Lamb kofta', 'Lamb, flatbread, cucumber salad · 580 kcal', ['Gluten'], ['No pork']),
  meal('m10', 2, 'breakfast', 'Greek yoghurt bowl', 'Yoghurt, honey, granola · 300 kcal', ['Dairy', 'Nuts'], []),
  meal('m11', 2, 'lunch', 'Teriyaki chicken bowl', 'Chicken, rice, edamame · 550 kcal', ['Soy', 'Sesame'], []),
  meal('m12', 2, 'dinner', 'Mushroom risotto', 'Arborio, porcini, parmesan · 530 kcal', ['Dairy'], ['Vegetarian']),
  meal('m13', 3, 'breakfast', 'Shakshuka', 'Eggs, tomato, pepper, sourdough · 410 kcal', ['Eggs', 'Gluten'], []),
  meal('m14', 3, 'lunch', 'Turkey meatballs', 'Turkey, orzo, roasted tomato · 560 kcal', ['Eggs', 'Dairy', 'Gluten'], []),
  meal('m15', 3, 'dinner', 'Thai green curry', 'Chicken, coconut, rice noodles · 570 kcal', ['Fish'], []),
  meal('m16', 4, 'breakfast', 'Protein smoothie bowl', 'Banana, whey, peanut butter · 350 kcal', ['Dairy', 'Peanuts'], []),
  meal('m17', 4, 'lunch', 'Beef ragù', 'Beef, penne, oregano · 620 kcal', ['Gluten'], ['No beef']),
  meal('m18', 4, 'dinner', 'Slow-roast harissa chicken', 'Chicken, freekeh, squash · 545 kcal', ['Gluten'], []),
  meal('m19', 5, 'breakfast', 'Overnight oats', 'Oats, almond milk, blueberry · 290 kcal', ['Nuts'], ['Vegan']),
  meal('m20', 5, 'lunch', 'Mezze bowl', 'Falafel, hummus, tabbouleh · 480 kcal', ['Gluten', 'Sesame'], ['Vegetarian']),
  meal('m21', 5, 'dinner', 'Sea bass fillet', 'Sea bass, new potato, asparagus · 500 kcal', ['Fish'], []),
  meal('m22', 6, 'breakfast', 'Egg white omelette', 'Egg white, spinach, feta · 260 kcal', ['Eggs', 'Dairy'], []),
  meal('m23', 6, 'lunch', 'Chili con karne 2.0', 'Beef, black bean, rice · 590 kcal', [], ['No beef']),
  meal('m24', 6, 'dinner', 'Miso aubergine', 'Aubergine, miso, soba · 460 kcal', ['Soy', 'Gluten', 'Sesame'], ['Vegan']),
];

export const DEMO_ACCOUNTS = [
  { email: 'maryam.lootah@gmail.com', name: 'Maryam Lootah', plan: 'Custom plan', perDay: 3, allergens: ['Nuts', 'Peanuts'], exclusions: ['No pork'] },
  { email: 'nathan.tynan@hotmail.co.uk', name: 'Nathan Tynan', plan: 'Standard plan', perDay: 2, allergens: ['Shellfish'], exclusions: ['No beef'] },
  { email: 'layla.haddad@mail.com', name: 'Layla Haddad', plan: 'Keto plan', perDay: 2, allergens: ['Dairy'], exclusions: ['Vegan'] },
];
