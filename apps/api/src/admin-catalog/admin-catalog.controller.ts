import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard, Roles } from '../common/auth/guards';
import { ZodPipe } from '../common/zod.pipe';
import { AdminCatalogService } from './admin-catalog.service';
import * as S from './admin-catalog.schemas';

type Out<T extends { _output: unknown }> = T['_output'];

@ApiTags('admin-catalog')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(AdminAuthGuard)
@Roles('super_admin')
export class AdminCatalogController {
  constructor(private readonly svc: AdminCatalogService) {}

  @Post('media/upload-signature')
  @HttpCode(200)
  signature(
    @Body(new ZodPipe(S.UploadSignatureInputSchema)) body: Out<typeof S.UploadSignatureInputSchema>,
  ) {
    return this.svc.signUpload(body.kind);
  }

  @Get('pattern-categories')
  categories() {
    return this.svc.listCategories();
  }
  @Post('pattern-categories')
  createCategory(
    @Body(new ZodPipe(S.CategoryInputSchema)) body: Out<typeof S.CategoryInputSchema>,
  ) {
    return this.svc.createCategory(body);
  }
  @Patch('pattern-categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body(new ZodPipe(S.CategoryPatchSchema)) body: Out<typeof S.CategoryPatchSchema>,
  ) {
    return this.svc.updateCategory(id, body);
  }

  @Get('patterns')
  patterns(
    @Query(new ZodPipe(S.PatternsAdminQuerySchema)) q: Out<typeof S.PatternsAdminQuerySchema>,
  ) {
    return this.svc.listPatterns(q);
  }
  @Post('patterns')
  createPattern(@Body(new ZodPipe(S.PatternInputSchema)) body: Out<typeof S.PatternInputSchema>) {
    return this.svc.createPattern(body);
  }
  @Patch('patterns/:id')
  updatePattern(
    @Param('id') id: string,
    @Body(new ZodPipe(S.PatternPatchSchema)) body: Out<typeof S.PatternPatchSchema>,
  ) {
    return this.svc.updatePattern(id, body);
  }

  @Get('colors')
  colors() {
    return this.svc.listColors();
  }
  @Post('colors')
  createColor(@Body(new ZodPipe(S.ColorInputSchema)) body: Out<typeof S.ColorInputSchema>) {
    return this.svc.createColor(body);
  }
  @Patch('colors/:id')
  updateColor(
    @Param('id') id: string,
    @Body(new ZodPipe(S.ColorPatchSchema)) body: Out<typeof S.ColorPatchSchema>,
  ) {
    return this.svc.updateColor(id, body);
  }

  @Get('fonts')
  fonts() {
    return this.svc.listFonts();
  }
  @Post('fonts')
  createFont(@Body(new ZodPipe(S.FontInputSchema)) body: Out<typeof S.FontInputSchema>) {
    return this.svc.createFont(body);
  }
  @Patch('fonts/:id')
  updateFont(
    @Param('id') id: string,
    @Body(new ZodPipe(S.FontPatchSchema)) body: Out<typeof S.FontPatchSchema>,
  ) {
    return this.svc.updateFont(id, body);
  }

  @Get('price-rules')
  priceRules() {
    return this.svc.getPriceRules();
  }
  @Post('price-rules')
  createPriceRules(
    @Body(new ZodPipe(S.PriceRulesInputSchema)) body: Out<typeof S.PriceRulesInputSchema>,
  ) {
    return this.svc.setPriceRules(body);
  }
  @Patch('price-rules')
  updatePriceRules(
    @Body(new ZodPipe(S.PriceRulesPatchSchema)) body: Out<typeof S.PriceRulesPatchSchema>,
  ) {
    return this.svc.setPriceRules(body);
  }

  @Get('banned-words')
  bannedWords() {
    return this.svc.listBannedWords();
  }
  @Post('banned-words')
  createBannedWord(
    @Body(new ZodPipe(S.BannedWordInputSchema)) body: Out<typeof S.BannedWordInputSchema>,
  ) {
    return this.svc.createBannedWord(body.word);
  }
  @Delete('banned-words/:id')
  @HttpCode(204)
  async deleteBannedWord(@Param('id') id: string): Promise<void> {
    await this.svc.deleteBannedWord(id);
  }
}
