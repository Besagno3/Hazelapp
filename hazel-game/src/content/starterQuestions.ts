import type { Question, Topic } from '../types';

/**
 * Starter questions (Act I launch review B5): a small hand-written bank for
 * every topic, so a child always has something to answer — when the question
 * service is down, offline, out of today's budget, or doesn't know a topic
 * yet. `fetchQuestions` (lib/questions.ts) fills whatever the server couldn't
 * from here. Every one passes the same kids' screen as AI questions
 * (`starterQuestions.test.ts`).
 *
 * Three bands by question level: easy (1–3), middle (4–6), hard (7–10), six
 * questions each. The right answer is listed first; answers are shuffled
 * when served (`shuffleAnswers`). Ids start `starter-` — they aren't in the
 * question bank, so they're never marked seen or reported to the server.
 */

/** A question, its four options (the right one first) and why. */
type Entry = readonly [text: string, options: readonly [string, string, string, string], explanation: string];

export const STARTER_BANDS = ['easy', 'middle', 'hard'] as const;
export type StarterBand = (typeof STARTER_BANDS)[number];

/** The level a band's questions are tagged with. */
const BAND_LEVEL: Record<StarterBand, number> = { easy: 2, middle: 5, hard: 8 };

/** Which band a question level (1–10) falls in. */
export function starterBand(level: number): StarterBand {
  if (level <= 3) return 'easy';
  if (level <= 6) return 'middle';
  return 'hard';
}

export const STARTER_ID_PREFIX = 'starter-';

const BANK: Record<Topic, Record<StarterBand, readonly Entry[]>> = {
  math: {
    easy: [
      ['What is 3 + 4?', ['7', '6', '8', '5'], 'Count on 4 from 3: 4, 5, 6, 7.'],
      ['How many sides does a triangle have?', ['3', '4', '5', '2'], 'Tri means three: a triangle has three sides and three corners.'],
      ['What is 10 − 3?', ['7', '6', '8', '13'], 'Start at 10 and count back 3: 9, 8, 7.'],
      ['Which number is the biggest: 9, 6, 3 or 8?', ['9', '6', '3', '8'], '9 comes after 8, 6 and 3 when you count, so it is the biggest.'],
      ['What is 5 + 5?', ['10', '9', '11', '55'], 'Five and five more make ten — like the fingers on two hands!'],
      ['How many legs do 2 dogs have altogether?', ['8', '4', '6', '10'], 'Each dog has 4 legs, and 4 + 4 = 8.'],
    ],
    middle: [
      ['What is 7 × 8?', ['56', '54', '48', '64'], 'Seven groups of eight make 56. A trick: 5, 6, 7, 8 — 56 = 7 × 8!'],
      ['What is half of 50?', ['25', '20', '30', '15'], 'Half means splitting into two equal parts: 25 + 25 = 50.'],
      ['Which fraction is the same as one half?', ['2/4', '1/3', '3/4', '2/3'], 'Two quarters fill the same space as one half.'],
      ['What is 144 ÷ 12?', ['12', '11', '14', '10'], '12 × 12 = 144, so 144 shared into 12 groups gives 12 in each.'],
      ['How many minutes are in 2 hours?', ['120', '100', '60', '200'], 'One hour has 60 minutes, so two hours have 60 + 60 = 120.'],
      ['A square has sides 5 cm long. What is its perimeter?', ['20 cm', '25 cm', '10 cm', '15 cm'], 'The perimeter is the distance all the way round: four sides of 5 cm make 20 cm.'],
    ],
    hard: [
      ['What is 15% of 200?', ['30', '15', '20', '45'], '10% of 200 is 20 and 5% is 10, so 15% is 20 + 10 = 30.'],
      ['What is the next prime number after 7?', ['11', '9', '8', '13'], '8, 9 and 10 can be divided by smaller numbers; 11 can only be divided by 1 and itself.'],
      ['If 3x + 4 = 19, what is x?', ['5', '6', '4', '7'], 'Take 4 from both sides: 3x = 15. Then 15 ÷ 3 = 5.'],
      ['A triangle has a base of 10 cm and a height of 6 cm. What is its area?', ['30 square cm', '60 square cm', '16 square cm', '36 square cm'], 'A triangle is half of a rectangle: 10 × 6 = 60, and half of 60 is 30.'],
      ['What is 2 to the power of 5?', ['32', '10', '25', '64'], '2 × 2 × 2 × 2 × 2: 4, 8, 16, 32.'],
      ['What do the three angles inside any triangle add up to?', ['180 degrees', '360 degrees', '90 degrees', '270 degrees'], 'Tear off the three corners of a paper triangle and they always make a straight line: 180 degrees.'],
    ],
  },
  science: {
    easy: [
      ['What do plants use to make their food?', ['Sunlight', 'Moonlight', 'Starlight', 'Shadows'], 'Leaves catch sunlight and use it, with water and air, to make food.'],
      ['What is frozen water called?', ['Ice', 'Steam', 'Fog', 'Sand'], 'When water gets very cold it freezes into hard ice.'],
      ['Which sense do you use your nose for?', ['Smell', 'Sight', 'Hearing', 'Touch'], 'Your nose smells things — like flowers or fresh bread.'],
      ['What pulls things down to the ground when you drop them?', ['Gravity', 'Wind', 'Magnets', 'Light'], 'Gravity pulls everything toward the Earth, so a dropped ball falls down.'],
      ['Which of these would a magnet pick up?', ['An iron nail', 'A wooden spoon', 'A paper cup', 'A rubber ball'], 'Magnets pull on iron, so they pick up iron nails but not wood, paper or rubber.'],
      ['What falls from clouds and makes puddles?', ['Rain', 'Wind', 'Sunshine', 'Thunder'], 'Clouds are full of tiny drops of water that fall as rain.'],
    ],
    middle: [
      ['Which gas do our bodies need from the air?', ['Oxygen', 'Carbon dioxide', 'Helium', 'Neon'], 'Every breath brings oxygen into your lungs, and your blood carries it all round your body.'],
      ['At what temperature does water boil, in degrees Celsius?', ['100', '50', '0', '212'], 'Water boils at 100 °C. (212 is the same heat in Fahrenheit.)'],
      ['Which state of matter keeps its own shape?', ['Solid', 'Liquid', 'Gas', 'Steam'], 'A solid, like a block of wood, keeps its shape. Liquids and gases take the shape of their container.'],
      ['Which part of a plant takes in water from the soil?', ['The roots', 'The petals', 'The leaves', 'The seeds'], 'Roots spread through the soil and soak up water for the whole plant.'],
      ['What is the energy of something moving called?', ['Kinetic energy', 'Stored energy', 'Light energy', 'Sound energy'], 'Anything moving — a rolling ball, a running dog — has kinetic energy.'],
      ['What do we call an animal that eats only plants?', ['A herbivore', 'A carnivore', 'An omnivore', 'A predator'], 'Herbivores, like cows and rabbits, eat only plants.'],
    ],
    hard: [
      ['What is the chemical symbol for gold?', ['Au', 'Go', 'Gd', 'Ag'], 'Au comes from aurum, the old Latin word for gold.'],
      ['Which part of a cell holds its instructions (its DNA)?', ['The nucleus', 'The cell wall', 'The membrane', 'The cytoplasm'], "The nucleus is like the cell's control room — it keeps the instructions for the cell."],
      ['About how fast does light travel?', ['300,000 km per second', '300 km per second', '3,000 km per hour', '30 km per second'], 'Light is the fastest thing there is: about 300,000 kilometres every second.'],
      ['When wood burns, what kind of change is that?', ['A chemical change', 'A physical change', 'No change at all', 'A magnetic change'], 'Burning turns wood into ash and smoke — new stuff that cannot turn back into wood.'],
      ['Which force slows down a box sliding across the floor?', ['Friction', 'Magnetism', 'Buoyancy', 'Lift'], 'Friction happens where two surfaces rub together, and it slows things down.'],
      ['What is H2O?', ['Water', 'Salt', 'Oxygen', 'Hydrogen'], 'H2O means two hydrogen atoms and one oxygen atom joined together: water!'],
    ],
  },
  engineering: {
    easy: [
      ['What kind of simple machine is a seesaw?', ['A lever', 'A wheel', 'A screw', 'A pulley'], 'A seesaw is a lever: a bar that tips on a point in the middle.'],
      ['What are most windows made of?', ['Glass', 'Wood', 'Brick', 'Cardboard'], 'Glass is see-through, so light can come in through windows.'],
      ['What shape is a wheel?', ['A circle', 'A square', 'A triangle', 'A star'], 'Circles roll smoothly, which is why wheels are round.'],
      ['Which of these floats in water?', ['A wooden block', 'A metal key', 'A stone', 'A glass marble'], 'Wood is light for its size, so it floats. Keys, stones and marbles sink.'],
      ['What can hold a few sheets of paper together?', ['A paper clip', 'A spoon', 'A sock', 'A crayon'], 'A paper clip is a bent piece of wire that squeezes papers together.'],
      ['Which would make the strongest little house?', ['Bricks', 'Straw', 'Paper', 'Leaves'], 'Bricks are hard and heavy, so a brick house stands strong in the wind.'],
    ],
    middle: [
      ['What is a pulley used for?', ['Lifting heavy things', 'Measuring time', 'Making light', 'Keeping things cold'], 'A pulley is a wheel with a rope round it that helps you lift heavy loads.'],
      ['Which shape can’t be pushed out of shape, so builders fill bridge frames with it?', ['The triangle', 'The square', 'The circle', 'The heart'], 'Push on a square frame and it leans over, but a triangle’s three sides hold it firm — so bridge frames are full of triangles.'],
      ['Which part of a computer is often called its brain?', ['The processor', 'The screen', 'The keyboard', 'The speakers'], 'The processor follows the instructions and does all the thinking.'],
      ['Which of these lets electricity flow through it best?', ['Copper', 'Rubber', 'Plastic', 'Wood'], 'Copper is a metal that carries electricity well, so wires are made of it.'],
      ['What do we call a list of step-by-step instructions, like a recipe?', ['An algorithm', 'An alarm', 'An antenna', 'An atlas'], 'An algorithm is a set of steps, done in order — computers follow algorithms.'],
      ['What does a thermometer measure?', ['Temperature', 'Weight', 'Speed', 'Length'], 'A thermometer tells you how hot or cold something is.'],
    ],
    hard: [
      ['In binary, what number does 101 stand for?', ['5', '101', '3', '6'], 'Binary counts in ones, twos and fours: 101 is one four, no twos and one one — 4 + 1 = 5.'],
      ['Why can a huge steel ship float?', ['Its shape pushes aside lots of water', 'Steel is lighter than water', 'Paint makes it float', 'The engine holds it up'], 'A hull is hollow and wide, so it pushes aside a lot of water — and the water pushes back up.'],
      ['What does a solar panel turn sunlight into?', ['Electricity', 'Sound', 'Wind', 'Rain'], 'Solar panels turn the energy in sunlight into electricity we can use.'],
      ['What does a switch in a circuit do?', ['Opens or closes the path', 'Stores electricity', 'Makes light', 'Measures power'], 'A switch joins or breaks the path, so electricity can flow or stop.'],
      ['A small gear with 10 teeth turns a big gear with 20 teeth. How does the big gear turn?', ['Slower', 'Faster', 'At the same speed', "It doesn't turn"], 'The small gear must go round twice to turn the big one once, so the big one turns slower.'],
      ['What does recycling something mean?', ['Using it to make something new', 'Throwing it in the sea', 'Painting it a new colour', 'Hiding it underground'], 'Recycling turns old things, like bottles and paper, into new things.'],
    ],
  },
  creativity: {
    easy: [
      ['What colour do you get when you mix blue and yellow paint?', ['Green', 'Purple', 'Orange', 'Pink'], 'Blue and yellow paint mix together to make green.'],
      ['What colour do you get when you mix red and white paint?', ['Pink', 'Black', 'Green', 'Blue'], 'Adding white to red makes it lighter: pink!'],
      ['Which tool do painters use to put paint on paper?', ['A paintbrush', 'A spoon', 'A hammer', 'A ladder'], 'A paintbrush has soft bristles that spread the paint.'],
      ['Which of these is a primary colour in paint?', ['Red', 'Green', 'Purple', 'Orange'], 'Red, yellow and blue are the primary colours in paint — you can mix them to make the others.'],
      ['Which shape has no corners at all?', ['A circle', 'A square', 'A triangle', 'A rectangle'], 'A circle is one smooth curve, so it has no corners.'],
      ['What do we call a picture of a person’s face?', ['A portrait', 'A landscape', 'A map', 'A poster'], 'A portrait shows a person, often their face.'],
    ],
    middle: [
      ['What colour do you get when you mix red and blue paint?', ['Purple', 'Green', 'Orange', 'Brown'], 'Red and blue paint mix together to make purple.'],
      ['What do we call a picture of the countryside?', ['A landscape', 'A portrait', 'A still life', 'A self-portrait'], 'A landscape shows a place — hills, fields, rivers and sky.'],
      ['Red, orange and yellow are called what?', ['Warm colours', 'Cool colours', 'Pale colours', 'Dark colours'], 'They remind us of fire and sunshine, so we call them warm colours.'],
      ['Which part of a story usually tells us who the characters are and where they are?', ['The beginning', 'The ending', 'The title', 'The index'], 'The beginning of a story introduces the characters and the setting.'],
      ['What is a sculpture?', ['Art made in 3D, like a statue', 'A song with no words', 'A painting on a wall', 'A book of poems'], 'A sculpture is art you can see from all sides, carved or built in 3D.'],
      ['What do you get if you mix red, yellow and blue paint together?', ['A muddy brown', 'Bright white', 'Light yellow', 'Sky blue'], 'Mixing all three primary paints makes a dark, muddy brown.'],
    ],
    hard: [
      ['What are colours opposite each other on the colour wheel called?', ['Complementary colours', 'Primary colours', 'Warm colours', 'Pastel colours'], 'Complementary colours, like red and green, sit opposite each other and make each other stand out.'],
      ['In a drawing, what is the vanishing point?', ['Where lines seem to meet far away', 'The edge of the paper', 'A spot that was rubbed out', 'The brightest part'], 'Roads and railways seem to meet at one point far away — the vanishing point.'],
      ['What is a mosaic made from?', ['Small pieces of tile or glass', 'One big brushstroke', 'Folded paper', 'Pencil shading only'], 'A mosaic is a picture made of many small pieces fitted together.'],
      ['What do we call a colour mixed with white?', ['A tint', 'A shade', 'A tone', 'A hue'], 'Adding white makes a tint (lighter); adding black makes a shade (darker).'],
      ['What do we call the main idea or message of a story?', ['The theme', 'The plot', 'The setting', 'The title'], 'The theme is what a story is really about, like friendship or being brave.'],
      ['When both halves of a picture match like a mirror, it has what?', ['Symmetry', 'Shadow', 'Texture', 'Rhythm'], 'Symmetry means one half is the mirror image of the other, like a butterfly.'],
    ],
  },
  history: {
    easy: [
      ['In which country are the Great Pyramids?', ['Egypt', 'Iceland', 'Brazil', 'Japan'], 'The Great Pyramids were built in Egypt more than 4,000 years ago.'],
      ['Before light bulbs, what did people use to light their homes at night?', ['Candles', 'Televisions', 'Phones', 'Torches with batteries'], 'People lit candles and oil lamps before electric light bulbs were invented.'],
      ['How did people travel on land before cars were invented?', ['On horses', 'In rockets', 'In airplanes', 'On escalators'], 'People rode horses or used carts pulled by horses.'],
      ['What were most castles built from?', ['Stone', 'Paper', 'Glass', 'Ice'], 'Castles were built from big, heavy stones so they would last.'],
      ['What do we call the study of things that happened long ago?', ['History', 'Geography', 'Math', 'Music'], 'History is the story of people and places from the past.'],
      ['What did people use to tell the time before clocks?', ['The Sun and shadows', 'Phones', 'Computers', 'Televisions'], "Long ago people watched where the Sun was in the sky, and how long shadows were."],
    ],
    middle: [
      ['Who wrote using pictures called hieroglyphs?', ['The ancient Egyptians', 'The Vikings', 'The ancient Greeks', 'The Celts'], 'Ancient Egyptians wrote with hieroglyphs — little pictures that stood for words and sounds.'],
      ['What did the ancient Romans build to carry water into their cities?', ['Aqueducts', 'Skyscrapers', 'Plastic pipes', 'Railways'], 'Aqueducts were long stone channels that carried water downhill into Roman towns.'],
      ['Which tool helped sailors find north at sea?', ['The compass', 'The telescope', 'The clock', 'The kite'], "A compass needle always points north, so sailors could find their way."],
      ['How many years are in a century?', ['100', '10', '1,000', '50'], 'A century is 100 years — "cent" means a hundred.'],
      ['What did ancient Egyptians make writing sheets from?', ['Papyrus reeds', 'Plastic', 'Glass', 'Steel'], 'Papyrus was a reed that grew by the river Nile. Its stems were pressed into sheets for writing.'],
      ['What was a sundial used for?', ['Telling the time', 'Cooking food', 'Catching fish', 'Measuring rain'], "A sundial's shadow moves as the Sun crosses the sky, pointing to the time."],
    ],
    hard: [
      ['Who built a famous printing press in Europe around 1440?', ['Johannes Gutenberg', 'Leonardo da Vinci', 'Isaac Newton', 'Galileo Galilei'], "Gutenberg's printing press made books much faster to copy, so many more people could read."],
      ['Which of these was one of the Seven Wonders of the Ancient World?', ['The Lighthouse of Alexandria', 'The Eiffel Tower', 'The Statue of Liberty', 'Big Ben'], 'The Lighthouse of Alexandria stood in Egypt more than 2,000 years ago and guided ships with its fire.'],
      ['The Silk Road was a trade route between which places?', ['China and Europe', 'Africa and Australia', 'North and South America', 'Iceland and Greenland'], 'Traders carried silk, spices and ideas along the Silk Road between China and Europe.'],
      ['Which people built the mountain city of Machu Picchu?', ['The Inca', 'The Vikings', 'The Romans', 'The Egyptians'], 'The Inca built Machu Picchu high in the Andes mountains of Peru.'],
      ['What began in Olympia, in ancient Greece?', ['The Olympic Games', 'The first library', 'The calendar', 'Paper money'], 'The first Olympic Games were held in Olympia about 2,800 years ago.'],
      ['How many years are in a millennium?', ['1,000', '100', '10', '10,000'], 'A millennium is 1,000 years — "mille" means a thousand.'],
    ],
  },
  words: {
    easy: [
      ['Which word rhymes with cat?', ['Hat', 'Dog', 'Cup', 'Sun'], 'Cat and hat both end with the same sound: -at.'],
      ['What is the opposite of hot?', ['Cold', 'Warm', 'Big', 'Fast'], 'Hot and cold are opposites, like up and down.'],
      ['Which letter comes after D in the alphabet?', ['E', 'C', 'F', 'B'], 'A, B, C, D, E — E comes right after D.'],
      ['Which of these words is a colour?', ['Blue', 'Jump', 'Table', 'Happy'], 'Blue is a colour, like the sky on a sunny day.'],
      ['How many letters are in the word dog?', ['3', '2', '4', '5'], 'D-O-G: three letters.'],
      ['Which of these words is an animal?', ['Rabbit', 'Chair', 'Spoon', 'Window'], 'A rabbit is an animal with long ears and a fluffy tail.'],
    ],
    middle: [
      ['Which word is a noun?', ['Mountain', 'Quickly', 'Beautiful', 'Jumped'], 'A noun names a person, place or thing — a mountain is a thing.'],
      ['What is the plural of mouse?', ['Mice', 'Mouses', 'Meese', 'Mousen'], 'One mouse, two mice! Some words change in their own way.'],
      ['Which word means the same as happy?', ['Glad', 'Sad', 'Tired', 'Angry'], 'Glad and happy mean almost the same thing.'],
      ['Which word is a verb (a doing word)?', ['Run', 'Purple', 'Pillow', 'Under'], 'A verb is an action — you can run.'],
      ['Which word is spelled correctly?', ['Because', 'Becuase', 'Becos', 'Beecause'], 'B-E-C-A-U-S-E. A trick: Big Elephants Can Always Understand Small Elephants.'],
      ['Who tells the story in a book?', ['The narrator', 'The reader', 'The printer', 'The editor'], 'The narrator is the voice telling the story.'],
    ],
    hard: [
      ['A word that sounds like its meaning, like "buzz", is called what?', ['Onomatopoeia', 'Alliteration', 'A metaphor', 'A simile'], 'Onomatopoeia means words that sound like what they describe: buzz, splash, pop!'],
      ['Which sentence uses a simile?', ['She was as quick as a fox.', 'She ran to the shop.', 'The fox was quick.', 'Run, fox, run!'], 'A simile compares two things using "as" or "like": as quick as a fox.'],
      ['What does the prefix un- mean in a word like unhappy?', ['Not', 'Very', 'Again', 'Before'], 'Un- means not: unhappy means not happy.'],
      ['Which word is an adverb?', ['Gently', 'Gentle', 'Gentleness', 'Gentleman'], 'An adverb tells how something is done, and many end in -ly: gently.'],
      ['There, their and they’re sound the same but mean different things. They are called what?', ['Homophones', 'Antonyms', 'Synonyms', 'Acronyms'], 'Homophones are words that sound the same but have different meanings and spellings.'],
      ['"The wind whispered through the trees" gives the wind a human action. What is that called?', ['Personification', 'Rhyme', 'Onomatopoeia', 'Exaggeration'], 'Personification describes a thing as if it were a person — wind can’t really whisper!'],
    ],
  },
  nature: {
    easy: [
      ['Which animal says moo?', ['A cow', 'A duck', 'A cat', 'A pig'], 'Cows say moo! Ducks quack, cats meow and pigs oink.'],
      ['Where do fish live?', ['In water', 'In trees', 'In the desert', 'In the clouds'], 'Fish live in water and breathe through their gills.'],
      ['What do caterpillars turn into?', ['Butterflies', 'Bees', 'Birds', 'Frogs'], 'A caterpillar makes a chrysalis, and comes out as a butterfly.'],
      ['Which season is usually the coldest?', ['Winter', 'Summer', 'Spring', 'Autumn'], 'Winter is the coldest season, when it can snow.'],
      ['How many legs does a spider have?', ['8', '6', '4', '10'], 'Spiders have 8 legs. Insects, like ants, have 6.'],
      ['What do bees make?', ['Honey', 'Milk', 'Silk', 'Wool'], 'Bees collect nectar from flowers and turn it into honey.'],
    ],
    middle: [
      ['What is a baby frog called?', ['A tadpole', 'A cub', 'A calf', 'A chick'], 'Frogs hatch from eggs as tadpoles, which swim and slowly grow legs.'],
      ['Which of these animals is a mammal?', ['A whale', 'A shark', 'A salmon', 'An octopus'], 'Whales are mammals: they breathe air and feed their babies milk.'],
      ['Some animals sleep through the winter. What do we say they do?', ['Hibernate', 'Migrate', 'Hunt', 'Pollinate'], 'Hibernating animals, like hedgehogs, sleep through the cold months.'],
      ['Which part of a plant makes the seeds?', ['The flower', 'The roots', 'The stem', 'The bark'], 'After a flower is pollinated, it makes seeds that can grow into new plants.'],
      ['What do we call the place where an animal naturally lives?', ['Its habitat', 'Its hobby', 'Its harvest', 'Its hammock'], 'A habitat is an animal’s home — a pond, a forest, a desert.'],
      ['What does your heart do?', ['Pumps blood around your body', 'Helps you smell', 'Digests food', 'Holds your bones together'], 'Your heart is a strong muscle that pumps blood all round your body.'],
    ],
    hard: [
      ['What is photosynthesis?', ['How plants make food from light', 'How animals sleep in winter', 'How rocks break apart', 'How birds find their way'], 'In photosynthesis, plants use sunlight, water and air to make their food.'],
      ['Frogs and newts belong to which animal group?', ['Amphibians', 'Reptiles', 'Mammals', 'Fish'], 'Amphibians start life in water and can live on land as adults.'],
      ['What is the largest animal that has ever lived?', ['The blue whale', 'The elephant', 'The giraffe', 'The great white shark'], 'Blue whales can be longer than two buses — bigger than any dinosaur.'],
      ['What do decomposers, like worms and mushrooms, do?', ['Break down fallen leaves and old wood', 'Make honey', 'Pollinate flowers', 'Build nests'], 'Decomposers break down old plant matter and put goodness back into the soil.'],
      ['What makes a rainbow?', ['Sunlight passing through raindrops', 'Wind blowing clouds', 'Moonlight on snow', 'Lightning in the sky'], 'Raindrops split sunlight into all its colours, making a rainbow.'],
      ['An animal that is awake at night is called what?', ['Nocturnal', 'Diurnal', 'Aquatic', 'Arctic'], 'Nocturnal animals, like owls and bats, are awake at night.'],
    ],
  },
  space: {
    easy: [
      ['Which planet do we live on?', ['Earth', 'Mars', 'Venus', 'Jupiter'], 'We live on planet Earth, the third planet from the Sun.'],
      ['What gives us light in the daytime?', ['The Sun', 'The Moon', 'A comet', 'Mars'], 'The Sun is a star, and its light makes the daytime bright.'],
      ['What shape is the Earth?', ['Round like a ball', 'Flat like a plate', 'Square like a box', 'Long like a stick'], 'Earth is round, like a giant ball spinning in space.'],
      ['What do astronauts ride into space?', ['A rocket', 'A bus', 'A boat', 'A bike'], 'Rockets are powerful enough to carry astronauts up into space.'],
      ['What twinkles in the night sky?', ['Stars', 'Rainbows', 'Kites', 'Butterflies'], 'Stars are far-away suns that seem to twinkle at night.'],
      ['What seems to change shape in the sky over a month?', ['The Moon', 'The Sun', 'The stars', 'The sky'], 'We see different amounts of the Moon’s bright side, from a thin crescent to a full Moon.'],
    ],
    middle: [
      ['Which planet is called the Red Planet?', ['Mars', 'Venus', 'Saturn', 'Neptune'], 'Mars looks red because its dust has lots of rusty iron in it.'],
      ['Which planet has the biggest, brightest rings?', ['Saturn', 'Mars', 'Mercury', 'Earth'], "Saturn's rings are made of ice and rock, and you can see them with a small telescope."],
      ['How many planets go round our Sun?', ['8', '9', '7', '10'], 'Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus and Neptune — 8 planets.'],
      ['What is at the centre of our solar system?', ['The Sun', 'The Earth', 'The Moon', 'Jupiter'], 'All the planets travel round the Sun, in the middle.'],
      ['How long does Earth take to go once round the Sun?', ['About 365 days', 'About 30 days', 'About 24 hours', 'About 10 years'], 'One trip round the Sun is one year: about 365 days.'],
      ['Which is the largest planet?', ['Jupiter', 'Earth', 'Venus', 'Mars'], 'Jupiter is so big that more than 1,000 Earths could fit inside it.'],
    ],
    hard: [
      ['What is a light-year?', ['How far light travels in a year', 'How long a year is on Mars', 'A very bright star', 'The time the Sun takes to set'], 'A light-year measures distance: how far light goes in a whole year.'],
      ['Which planet is closest to the Sun?', ['Mercury', 'Venus', 'Earth', 'Mars'], 'Mercury is the closest planet to the Sun, and the smallest.'],
      ['What is the name of our galaxy?', ['The Milky Way', 'Andromeda', 'The Big Dipper', 'Orion'], 'Our Sun is one of billions of stars in the Milky Way galaxy.'],
      ['What causes day and night?', ['The Earth spins', 'The Sun turns off', 'The Moon blocks the Sun', 'Clouds cover the Sun'], 'Earth spins once a day: the side facing the Sun has day, the other side has night.'],
      ['Why does the Moon seem to change shape?', ['We see different amounts of its sunlit side', "Earth's shadow covers it every night", 'The Moon really changes shape', 'Clouds hide parts of it'], 'The Sun always lights half the Moon; as it travels round us we see more or less of that half.'],
      ['Who was the first person to walk on the Moon?', ['Neil Armstrong', 'Yuri Gagarin', 'Sally Ride', 'Galileo Galilei'], 'Neil Armstrong stepped onto the Moon in 1969.'],
    ],
  },
  geography: {
    easy: [
      ['What is a map for?', ['Finding your way', 'Cooking dinner', 'Brushing teeth', 'Singing songs'], 'A map shows where places are, so you can find your way.'],
      ['What do we call a very dry place with little rain?', ['A desert', 'A rainforest', 'A swamp', 'A river'], 'Deserts get very little rain, so few plants grow there.'],
      ['What is a huge area of salty water called?', ['An ocean', 'A puddle', 'A pond', 'A stream'], 'Oceans are huge and salty, and they cover most of the Earth.'],
      ['What do we call very tall land with a pointy top?', ['A mountain', 'A valley', 'A beach', 'A field'], 'Mountains are the tallest land of all.'],
      ['In which direction does the Sun rise?', ['East', 'West', 'North', 'South'], 'The Sun rises in the east and sets in the west.'],
      ['What is land with water all around it called?', ['An island', 'A hill', 'A forest', 'A road'], 'An island has water on every side.'],
    ],
    middle: [
      ['How many continents are there?', ['7', '3', '10', '12'], 'Africa, Antarctica, Asia, Australia, Europe, North America and South America: 7.'],
      ['Which is the largest ocean?', ['The Pacific Ocean', 'The Atlantic Ocean', 'The Indian Ocean', 'The Arctic Ocean'], 'The Pacific is the biggest and deepest ocean on Earth.'],
      ['Which is the coldest continent?', ['Antarctica', 'Africa', 'Europe', 'Australia'], 'Antarctica is covered in ice and is the coldest place on Earth.'],
      ['Which is the longest river in Africa?', ['The Nile', 'The Thames', 'The Amazon', 'The Danube'], 'The Nile flows north through Africa into the Mediterranean Sea.'],
      ['What is a round model of the Earth called?', ['A globe', 'A compass', 'A ruler', 'A chart'], 'A globe is a ball with a map of the whole world on it.'],
      ['What is the imaginary line around the middle of the Earth called?', ['The equator', 'The horizon', 'The coastline', 'The border'], 'The equator circles the middle of the Earth, halfway between the North and South Poles.'],
    ],
    hard: [
      ['Which is the highest mountain on Earth?', ['Mount Everest', 'Mount Kilimanjaro', 'Mont Blanc', 'Mount Fuji'], 'Mount Everest, in the Himalayas, is the highest mountain above sea level.'],
      ['Lines of latitude measure how far a place is from what?', ['The equator', 'The North Star', 'The ocean floor', 'The nearest city'], 'Latitude tells you how far north or south of the equator a place is.'],
      ['Counting cold deserts too, which is the largest desert?', ['Antarctica', 'The Sahara', 'The Gobi', 'The Mojave'], 'A desert is a place with very little rain or snow — and icy Antarctica is the biggest of all.'],
      ['What is a peninsula?', ['Land almost surrounded by water', 'A very deep lake', 'A mountain made of ice', 'A flat, grassy plain'], 'A peninsula sticks out into the sea, with water on three sides.'],
      ['Which river flows through the Amazon rainforest?', ['The Amazon River', 'The Nile', 'The Mississippi', 'The Yangtze'], 'The Amazon River carries more water than any other river.'],
      ['What do we call a wide, grassy plain with few trees, like those in East Africa?', ['A savanna', 'A glacier', 'A canyon', 'A volcano'], 'Savannas are warm grasslands where zebras and giraffes roam.'],
    ],
  },
  music: {
    easy: [
      ['Which instrument do you hit with sticks?', ['A drum', 'A flute', 'A violin', 'A harp'], 'You play a drum by tapping it with sticks or your hands.'],
      ['Which instrument has black and white keys?', ['A piano', 'A trumpet', 'A guitar', 'A drum'], 'A piano has white keys and black keys that you press to play notes.'],
      ['Which instrument do you blow into?', ['A recorder', 'A drum', 'A piano', 'A tambourine'], 'You blow into a recorder and cover its holes with your fingers.'],
      ['What do we call a group of people singing together?', ['A choir', 'A crowd', 'A queue', 'A team'], 'A choir is a group of singers.'],
      ['Which instrument has strings you strum?', ['A guitar', 'A drum', 'A trumpet', 'A whistle'], 'You strum or pluck the strings of a guitar.'],
      ['What are the words of a song called?', ['The lyrics', 'The drums', 'The notes', 'The stage'], 'Lyrics are the words that are sung.'],
    ],
    middle: [
      ['How many strings does a violin have?', ['4', '6', '3', '8'], 'A violin has four strings, played with a bow.'],
      ['Which family of instruments does the trumpet belong to?', ['Brass', 'Strings', 'Woodwind', 'Percussion'], 'Trumpets are brass instruments: you buzz your lips into the mouthpiece.'],
      ['What is the beat of a piece of music?', ['Its steady pulse', 'Its loudest note', 'Its words', 'Its title'], 'The beat is the steady pulse you can clap or tap your foot to.'],
      ['How many lines does a music staff have?', ['5', '4', '6', '3'], 'Music is written on a staff of five lines and four spaces.'],
      ['In music, what does forte mean?', ['Loud', 'Soft', 'Fast', 'Slow'], 'Forte means play loudly. Piano means play softly.'],
      ['Which of these is a percussion instrument?', ['A xylophone', 'A clarinet', 'A cello', 'A trombone'], 'Percussion instruments are struck — you hit a xylophone’s bars with mallets.'],
    ],
    hard: [
      ['How many beats does a whole note last in 4/4 time?', ['4', '2', '1', '8'], 'A whole note fills a whole bar of 4/4 time: four beats.'],
      ['What do we call several notes played at the same time?', ['A chord', 'A scale', 'A rest', 'A tempo'], 'A chord is three or more notes played together.'],
      ['What does tempo mean in music?', ['How fast the music goes', 'How loud the music is', 'How high the notes are', 'How long the song is'], 'Tempo is the speed of the music.'],
      ['Which woodwind instrument is usually made of metal?', ['The flute', 'The oboe', 'The bassoon', 'The clarinet'], 'Flutes are woodwinds even though most are made of metal — the sound starts with air, not lips buzzing.'],
      ['Which is the highest singing voice?', ['Soprano', 'Bass', 'Tenor', 'Baritone'], 'Soprano is the highest voice; bass is the lowest.'],
      ['Which instrument usually has 88 keys?', ['The piano', 'The organ', 'The accordion', 'The harp'], 'A full piano has 88 keys: 52 white and 36 black.'],
    ],
  },
};

/** Every starter question for a topic and band, as `Question`s (right answer first). */
export function starterBank(topic: Topic, band: StarterBand): Question[] {
  return BANK[topic][band].map(([text, options, explanation], i) => ({
    id: `${STARTER_ID_PREFIX}${topic}-${band}-${i + 1}`,
    topic,
    level: BAND_LEVEL[band],
    text,
    options: [...options],
    correctIndex: 0,
    explanation,
  }));
}

/** The bands to draw from for a level: its own first, then the nearest. */
function bandOrder(level: number): StarterBand[] {
  const own = starterBand(level);
  if (own === 'easy') return ['easy', 'middle', 'hard'];
  if (own === 'hard') return ['hard', 'middle', 'easy'];
  return ['middle', 'easy', 'hard'];
}

/**
 * Up to `count` different starter questions for a topic at a level, in a
 * random order: the level's own band first, topped up from the nearest band
 * if it asks for more (a battle wants 9; a band has 6). Answers are not
 * shuffled here — `fetchQuestions` does that as it serves them.
 */
export function starterQuestions(
  topic: Topic,
  level: number,
  count: number,
  random: () => number = Math.random,
): Question[] {
  const out: Question[] = [];
  for (const band of bandOrder(level)) {
    if (out.length >= count) break;
    const pool = starterBank(topic, band);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    out.push(...pool.slice(0, count - out.length));
  }
  return out;
}

/** Whether a question id is one of these (not in the server's question bank). */
export function isStarterId(id: string): boolean {
  return id.startsWith(STARTER_ID_PREFIX);
}
