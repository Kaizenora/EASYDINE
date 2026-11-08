import { forwardRef, Module } from '@nestjs/common';
import { BranchAccessService } from '../../common/services/branch-access.service';
import { OrdersModule } from '../orders/orders.module';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';

@Module({
  imports: [forwardRef(() => OrdersModule)],
  controllers: [TablesController],
  providers: [TablesService, BranchAccessService],
  exports: [TablesService],
})
export class TablesModule {}
