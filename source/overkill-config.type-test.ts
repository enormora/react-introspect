import { expect } from 'tstyche';
import type { RunProjectConfig } from '@overkill-dev/test/config';
import { config } from '../tool-configurations/overkill.config.ts';

expect(config).type.toBeAssignableTo<RunProjectConfig>();
