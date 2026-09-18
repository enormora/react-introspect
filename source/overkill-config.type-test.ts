import { expect } from 'tstyche';
import type { RunProjectConfig } from '@overkill-dev/test/config';
import { config } from '../overkill.config.ts';

expect(config).type.toBeAssignableTo<RunProjectConfig>();
