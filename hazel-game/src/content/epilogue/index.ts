import { EPILOGUE_HOME } from './home';
import { EPILOGUE_ACT1 } from './act1';
import { EPILOGUE_SEA } from './sea';
import { EPILOGUE_TALESHORE } from './taleshore';

/** Every epilogue line (#75 item 16f), by NPC id — one per person, said once `umbra-named` is set. */
export const EPILOGUE_PARTS: readonly Readonly<Record<string, string>>[] = [EPILOGUE_HOME, EPILOGUE_ACT1, EPILOGUE_SEA, EPILOGUE_TALESHORE];
export const EPILOGUE: Readonly<Record<string, string>> = Object.assign({}, ...EPILOGUE_PARTS);
